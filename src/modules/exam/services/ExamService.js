const prisma = require('../../../prisma');
const examRepository = require('../repositories/ExamRepository');

/**
 * ExamService
 * Implements business logic for managing exams and generating immutable versions.
 */
class ExamService {
  /**
   * Find an exam by ID.
   * @param {number} id - Exam ID
   * @param {number} instituteId - Tenant ID
   * @returns {Promise<object>}
   */
  async getExam(id, instituteId) {
    const exam = await examRepository.findById(id, instituteId, {
      settings: true,
      instructions: { orderBy: { order: 'asc' } },
      sections: {
        orderBy: { order: 'asc' },
        include: {
          questions: {
            orderBy: { order: 'asc' },
            include: {
              question: {
                include: {
                  options: true,
                  codingQuestion: {
                    include: {
                      testCases: true
                    }
                  },
                  descriptiveQuestion: true
                }
              }
            }
          }
        }
      }
    });

    if (!exam) {
      throw new Error('EXAM_NOT_FOUND');
    }

    return exam;
  }

  /**
   * Get exams list.
   * @param {object} params - Filters
   * @returns {Promise<object>}
   */
  async listExams(params) {
    return examRepository.findAll(params);
  }

  /**
   * Create a draft exam.
   * @param {object} examData - Title, description, timing, creator, tenant
   * @param {object} settingsData - Config details
   * @param {Array<string>} instructions - Instructions text array
   * @returns {Promise<object>} Created Exam
   */
  async createExam(examData, settingsData, instructions) {
    // Validate dates
    const start = new Date(examData.startDate);
    const end = new Date(examData.endDate);
    if (start >= end) {
      throw new Error('INVALID_DATE_RANGE');
    }

    return examRepository.create(examData, settingsData, instructions);
  }

  /**
   * Update draft exam with optimistic locking.
   * @param {number} id - Exam ID
   * @param {number} instituteId - Tenant ID
   * @param {number} currentVersion - Current DB version
   * @param {object} examUpdate - Exam fields
   * @param {object} [settingsUpdate] - Settings fields
   * @param {Array<string>} [instructions] - Instruction list replacement
   * @returns {Promise<object>} Updated Exam
   */
  async updateExam(id, instituteId, currentVersion, examUpdate, settingsUpdate, instructions) {
    const exam = await examRepository.findById(id, instituteId);
    if (!exam) {
      throw new Error('EXAM_NOT_FOUND');
    }

    if (exam.status === 'PUBLISHED' || exam.status === 'ARCHIVED') {
      throw new Error('EXAM_LOCKED');
    }

    if (examUpdate.startDate || examUpdate.endDate) {
      const start = new Date(examUpdate.startDate || exam.startDate);
      const end = new Date(examUpdate.endDate || exam.endDate);
      if (start >= end) {
        throw new Error('INVALID_DATE_RANGE');
      }
    }

    // 1. Perform transaction for core + settings
    const updated = await examRepository.update(id, instituteId, currentVersion, examUpdate, settingsUpdate);

    // 2. Perform instructions replacement if provided
    if (instructions) {
      await examRepository.updateInstructions(id, instructions);
    }

    return this.getExam(id, instituteId);
  }

  /**
   * Reschedule an exam (update start date, end date, result release date, timezone).
   * Accessible by Batch Managers, Mentors, and Admins.
   * @param {number} id - Exam ID
   * @param {number} instituteId - Tenant ID
   * @param {object} scheduleData - startDate, endDate, publishResultDate, timezone
   * @returns {Promise<object>} Updated Exam
   */
  async rescheduleExam(id, instituteId, scheduleData) {
    const exam = await examRepository.findById(id, instituteId);
    if (!exam) {
      throw new Error('EXAM_NOT_FOUND');
    }

    const start = scheduleData.startDate ? new Date(scheduleData.startDate) : new Date(exam.startDate);
    const end = scheduleData.endDate ? new Date(scheduleData.endDate) : new Date(exam.endDate);

    if (start >= end) {
      throw new Error('INVALID_DATE_RANGE');
    }

    const updateData = {
      startDate: start,
      endDate: end
    };
    if (scheduleData.publishResultDate !== undefined) {
      updateData.publishResultDate = scheduleData.publishResultDate ? new Date(scheduleData.publishResultDate) : null;
    }
    if (scheduleData.timezone) {
      updateData.timezone = scheduleData.timezone;
    }

    await prisma.exam.update({
      where: { id },
      data: updateData
    });

    // Also update active ExamVersion records so student attempt runners reflect rescheduled dates
    await prisma.examVersion.updateMany({
      where: { examId: id },
      data: {
        startDate: start,
        endDate: end,
        timezone: scheduleData.timezone || exam.timezone,
        publishResultDate: updateData.publishResultDate
      }
    }).catch(() => null);

    return this.getExam(id, instituteId);
  }

  /**
   * Delete/Archive exam draft.
   * @param {number} id - Exam ID
   * @param {number} instituteId - Tenant ID
   * @param {number} deletedById - User performing delete
   */
  async deleteExam(id, instituteId, deletedById) {
    const exam = await examRepository.findById(id, instituteId);
    if (!exam) {
      throw new Error('EXAM_NOT_FOUND');
    }

    return examRepository.delete(id, instituteId, deletedById);
  }

  /**
   * Publish a draft/review exam.
   * Snapshots sections, questions, MCQ options, coding limits, and descriptive details into a new ExamVersion.
   * Enforced in a single Prisma transaction to ensure absolute consistency.
   * @param {number} examId - Exam ID
   * @param {number} instituteId - Tenant ID
   * @returns {Promise<object>} Published snapshotted version
   */
  async publishExam(examId, instituteId) {
    return prisma.$transaction(async (tx) => {
      // 1. Fetch exam with settings, instructions, sections, and questions
      const exam = await tx.exam.findFirst({
        where: { id: examId, instituteId, deletedAt: null },
        include: {
          settings: true,
          instructions: { orderBy: { order: 'asc' } },
          sections: {
            orderBy: { order: 'asc' },
            include: {
              questions: {
                orderBy: { order: 'asc' },
                include: {
                  question: {
                    include: {
                      options: true,
                      codingQuestion: { include: { testCases: true } },
                      descriptiveQuestion: true
                    }
                  }
                }
              }
            }
          }
        }
      });

      if (!exam) {
        throw new Error('EXAM_NOT_FOUND');
      }

      // Publish validation rules:
      // 1. At least one section
      if (exam.sections.length === 0) {
        throw new Error('EXAM_VALIDATION_FAILED: At least one section is required to publish.');
      }

      // 2. Duration check: (endDate - startDate) / 60000 > 0
      const durationMin = Math.floor((new Date(exam.endDate).getTime() - new Date(exam.startDate).getTime()) / 60000);
      if (durationMin <= 0) {
        throw new Error('EXAM_VALIDATION_FAILED: Exam duration (EndDate - StartDate) must be greater than 0 minutes.');
      }

      let totalMarks = 0;
      for (const sec of exam.sections) {
        // 3. Every section has questions
        if (sec.questions.length === 0) {
          throw new Error(`EXAM_VALIDATION_FAILED: Section "${sec.title}" must contain at least one question.`);
        }

        for (const secQ of sec.questions) {
          const q = secQ.question;
          totalMarks += q.marks;

          // 4. MCQs have correct answers
          if (q.type === 'MCQ') {
            const hasCorrectOption = q.options.some((o) => o.isCorrect === true);
            if (!hasCorrectOption) {
              throw new Error(`EXAM_VALIDATION_FAILED: MCQ Question "${q.title}" must have at least one correct answer option.`);
            }
          }

          // 5. Coding questions have visible and hidden test cases
          if (q.type === 'CODING') {
            if (!q.codingQuestion) {
              throw new Error(`EXAM_VALIDATION_FAILED: Coding Question "${q.title}" is missing compile limits configurations.`);
            }
            const testCases = q.codingQuestion.testCases || [];
            const hasSample = testCases.some((tc) => tc.isSample === true);
            const hasHidden = testCases.some((tc) => tc.isSample === false);
            if (!hasSample || !hasHidden) {
              throw new Error(`EXAM_VALIDATION_FAILED: Coding Question "${q.title}" must have at least one visible (sample) and one hidden test case.`);
            }
          }

          // 6. Descriptive questions have valid limits
          if (q.type === 'DESCRIPTIVE') {
            if (!q.descriptiveQuestion) {
              throw new Error(`EXAM_VALIDATION_FAILED: Descriptive Question "${q.title}" is missing configuration details.`);
            }
            const dq = q.descriptiveQuestion;
            if (dq.wordLimit !== null && dq.wordLimit <= 0) {
              throw new Error(`EXAM_VALIDATION_FAILED: Descriptive Question "${q.title}" word limit must be greater than 0.`);
            }
            if (dq.charLimit !== null && dq.charLimit <= 0) {
              throw new Error(`EXAM_VALIDATION_FAILED: Descriptive Question "${q.title}" character limit must be greater than 0.`);
            }
          }
        }
      }

      // 7. Total marks > 0
      if (totalMarks <= 0) {
        throw new Error('EXAM_VALIDATION_FAILED: Total marks for the exam must be greater than 0.');
      }

      // 2. Verify version count and increment version number
      const newVersionNum = exam.version;

      const settingsSnapshot = exam.settings || {};
      const instructionsSnapshot = exam.instructions.map((inst) => inst.text);

      // 4. Create the ExamVersion snapshot
      const examVersion = await tx.examVersion.create({
        data: {
          examId: exam.id,
          version: newVersionNum,
          title: exam.title,
          description: exam.description,
          duration: exam.settings?.autoSubmit ? 120 : 180, // Default duration if not set
          maxMarks: totalMarks,
          passingMarks: totalMarks * 0.4, // Default 40% pass criteria
          startDate: exam.startDate,
          endDate: exam.endDate,
          timezone: exam.timezone,
          publishResultDate: exam.publishResultDate,
          resultReleasePolicy: exam.resultReleasePolicy,
          settingsSnapshot,
          instructionsSnapshot
        }
      });

      // 5. Duplicate each draft section and snapshot questions
      for (const section of exam.sections) {
        const versionSection = await tx.examVersionSection.create({
          data: {
            examVersionId: examVersion.id,
            title: section.title,
            description: section.description,
            type: section.type,
            order: section.order
          }
        });

        const questionsData = [];
        for (const secQ of section.questions) {
          const q = secQ.question;

          // Build snap MCQ options
          const mcqOptions = q.type === 'MCQ' ? q.options.map(o => ({
            id: o.id,
            text: o.text,
            isCorrect: o.isCorrect,
            order: o.order
          })) : null;

          // Build snap Coding details
          const codingDetails = q.type === 'CODING' && q.codingQuestion ? {
            constraints: q.codingQuestion.constraints,
            inputFormat: q.codingQuestion.inputFormat,
            outputFormat: q.codingQuestion.outputFormat,
            starterCode: q.codingQuestion.starterCode,
            timeLimit: q.codingQuestion.timeLimit,
            memoryLimit: q.codingQuestion.memoryLimit,
            testCases: q.codingQuestion.testCases.map(tc => ({
              id: tc.id,
              input: tc.input,
              expectedOutput: tc.expectedOutput,
              isSample: tc.isSample,
              weight: tc.weight
            }))
          } : null;

          // Build snap Descriptive details
          const descriptiveDetails = q.type === 'DESCRIPTIVE' && q.descriptiveQuestion ? {
            wordLimit: q.descriptiveQuestion.wordLimit,
            charLimit: q.descriptiveQuestion.charLimit,
            rubric: q.descriptiveQuestion.rubric,
            sampleAnswer: q.descriptiveQuestion.sampleAnswer,
            allowFileUpload: q.descriptiveQuestion.allowFileUpload,
            maxFileSize: q.descriptiveQuestion.maxFileSize,
            allowedExtensions: q.descriptiveQuestion.allowedExtensions
          } : null;

          questionsData.push({
            sectionId: versionSection.id,
            originalQuestionId: q.id,
            title: q.title,
            text: q.text,
            type: q.type,
            marks: q.marks,
            negativeMarks: q.negativeMarks,
            explanation: q.explanation,
            difficulty: q.difficulty,
            order: secQ.order,
            mcqOptions,
            codingDetails,
            descriptiveDetails
          });
        }

        if (questionsData.length > 0) {
          await tx.examVersionQuestion.createMany({
            data: questionsData
          });
        }
      }

      // 6. Update the main Exam record: set status to PUBLISHED and current version pointer
      await tx.exam.update({
        where: { id: exam.id },
        data: {
          status: 'PUBLISHED',
          currentVersionId: examVersion.id,
          version: { increment: 1 } // Pre-increment next draft version
        }
      });

      return tx.examVersion.findUnique({
        where: { id: examVersion.id },
        include: {
          sections: {
            include: { questions: true }
          }
        }
      });
    });
  }

  /**
   * Archive an exam.
   * @param {number} examId - Exam ID
   * @param {number} instituteId - Tenant ID
   * @returns {Promise<object>} Updated exam
   */
  async archiveExam(examId, instituteId) {
    return prisma.exam.update({
      where: { id: examId, instituteId },
      data: {
        status: 'ARCHIVED'
      }
    });
  }

  // ── Section Draft CRUD ──────────────────────────────────────────────────────

  async addSection(examId, title, description, type) {
    return prisma.section.create({
      data: {
        examId,
        title,
        description,
        type,
        order: 99 // Default to append at end, client reorders later
      }
    });
  }

  async updateSection(sectionId, title, description, type) {
    return prisma.section.update({
      where: { id: sectionId },
      data: {
        title,
        description,
        type
      }
    });
  }

  async deleteSection(sectionId) {
    return prisma.section.delete({
      where: { id: sectionId }
    });
  }

  // ── Question Draft CRUD inside Sections ──────────────────────────────────────

  async createQuestionInSection(sectionId, questionData, details) {
    return prisma.$transaction(async (tx) => {
      // 1. Create reusable Question
      const q = await tx.question.create({
        data: {
          title: questionData.title,
          text: questionData.text,
          type: questionData.type,
          marks: questionData.marks || 1,
          negativeMarks: questionData.negativeMarks || 0,
          explanation: questionData.explanation,
          difficulty: questionData.difficulty || 'EASY'
        }
      });

      // 2. Link to draft Section
      await tx.sectionQuestion.create({
        data: {
          sectionId,
          questionId: q.id,
          order: 99
        }
      });

      // 3. Create nested properties
      if (questionData.type === 'MCQ' && details.options) {
        await tx.mCQOption.createMany({
          data: details.options.map((opt, index) => ({
            questionId: q.id,
            text: opt.text,
            isCorrect: opt.isCorrect,
            order: opt.order ?? index
          }))
        });
      } else if (questionData.type === 'CODING' && details.coding) {
        const codingQ = await tx.codingQuestion.create({
          data: {
            questionId: q.id,
            constraints: details.coding.constraints,
            inputFormat: details.coding.inputFormat,
            outputFormat: details.coding.outputFormat,
            starterCode: details.coding.starterCode,
            timeLimit: details.coding.timeLimit || 2000,
            memoryLimit: details.coding.memoryLimit || 256
          }
        });
        if (details.coding.testCases) {
          await tx.codingTestCase.createMany({
            data: details.coding.testCases.map((tc) => ({
              codingQuestionId: codingQ.id,
              input: tc.input,
              expectedOutput: tc.expectedOutput,
              isSample: tc.isSample || false,
              weight: tc.weight || 100.0
            }))
          });
        }
      } else if (questionData.type === 'DESCRIPTIVE' && details.descriptive) {
        await tx.descriptiveQuestion.create({
          data: {
            questionId: q.id,
            wordLimit: details.descriptive.wordLimit,
            charLimit: details.descriptive.charLimit,
            rubric: details.descriptive.rubric,
            sampleAnswer: details.descriptive.sampleAnswer,
            allowFileUpload: details.descriptive.allowFileUpload || false,
            maxFileSize: details.descriptive.maxFileSize || 5,
            allowedExtensions: details.descriptive.allowedExtensions || []
          }
        });
      }

      return q;
    });
  }

  async updateQuestion(questionId, questionData, details) {
    return prisma.$transaction(async (tx) => {
      // 1. Update core Question fields
      const q = await tx.question.update({
        where: { id: questionId },
        data: {
          title: questionData.title,
          text: questionData.text,
          marks: questionData.marks !== undefined ? questionData.marks : undefined,
          negativeMarks: questionData.negativeMarks !== undefined ? questionData.negativeMarks : undefined,
          explanation: questionData.explanation,
          difficulty: questionData.difficulty
        }
      });

      // 2. Update nested details based on type
      if (q.type === 'MCQ' && details.options) {
        // Clear existing options
        await tx.mCQOption.deleteMany({
          where: { questionId }
        });
        // Create new ones
        await tx.mCQOption.createMany({
          data: details.options.map((opt, index) => ({
            questionId,
            text: opt.text,
            isCorrect: opt.isCorrect,
            order: opt.order ?? index
          }))
        });
      } else if (q.type === 'CODING' && details.coding) {
        // Find or create CodingQuestion entry
        const existingCoding = await tx.codingQuestion.findUnique({
          where: { questionId }
        });

        let codingQId;
        if (existingCoding) {
          const updated = await tx.codingQuestion.update({
            where: { questionId },
            data: {
              constraints: details.coding.constraints,
              inputFormat: details.coding.inputFormat,
              outputFormat: details.coding.outputFormat,
              starterCode: details.coding.starterCode,
              timeLimit: details.coding.timeLimit || 2000,
              memoryLimit: details.coding.memoryLimit || 256
            }
          });
          codingQId = updated.id;
        } else {
          const created = await tx.codingQuestion.create({
            data: {
              questionId,
              constraints: details.coding.constraints,
              inputFormat: details.coding.inputFormat,
              outputFormat: details.coding.outputFormat,
              starterCode: details.coding.starterCode,
              timeLimit: details.coding.timeLimit || 2000,
              memoryLimit: details.coding.memoryLimit || 256
            }
          });
          codingQId = created.id;
        }

        // Handle test cases (clear and recreate)
        if (details.coding.testCases) {
          await tx.codingTestCase.deleteMany({
            where: { codingQuestionId: codingQId }
          });
          await tx.codingTestCase.createMany({
            data: details.coding.testCases.map((tc) => ({
              codingQuestionId: codingQId,
              input: tc.input,
              expectedOutput: tc.expectedOutput,
              isSample: tc.isSample || false,
              weight: tc.weight || 100.0
            }))
          });
        }
      } else if (q.type === 'DESCRIPTIVE' && details.descriptive) {
        // Find or create DescriptiveQuestion entry
        const existingDescriptive = await tx.descriptiveQuestion.findUnique({
          where: { questionId }
        });

        if (existingDescriptive) {
          await tx.descriptiveQuestion.update({
            where: { questionId },
            data: {
              wordLimit: details.descriptive.wordLimit,
              charLimit: details.descriptive.charLimit,
              rubric: details.descriptive.rubric,
              sampleAnswer: details.descriptive.sampleAnswer,
              allowFileUpload: details.descriptive.allowFileUpload || false,
              maxFileSize: details.descriptive.maxFileSize || 5,
              allowedExtensions: details.descriptive.allowedExtensions || []
            }
          });
        } else {
          await tx.descriptiveQuestion.create({
            data: {
              questionId,
              wordLimit: details.descriptive.wordLimit,
              charLimit: details.descriptive.charLimit,
              rubric: details.descriptive.rubric,
              sampleAnswer: details.descriptive.sampleAnswer,
              allowFileUpload: details.descriptive.allowFileUpload || false,
              maxFileSize: details.descriptive.maxFileSize || 5,
              allowedExtensions: details.descriptive.allowedExtensions || []
            }
          });
        }
      }

      return tx.question.findUnique({
        where: { id: questionId },
        include: {
          options: true,
          codingQuestion: { include: { testCases: true } },
          descriptiveQuestion: true
        }
      });
    });
  }

  async addQuestionToSection(sectionId, questionId) {
    return prisma.sectionQuestion.create({
      data: {
        sectionId,
        questionId,
        order: 99
      }
    });
  }

  async removeQuestionFromSection(sectionId, questionId) {
    return prisma.sectionQuestion.delete({
      where: {
        sectionId_questionId: { sectionId, questionId }
      }
    });
  }

  // ── Drag & Drop Hierarchy Reorder ───────────────────────────────────────────

  async reorderExam(examId, sectionsData) {
    return prisma.$transaction(async (tx) => {
      for (const sec of sectionsData) {
        // Update section order
        await tx.section.update({
          where: { id: sec.id, examId },
          data: { order: sec.order }
        });

        // Update each question mapped in this section
        for (const q of sec.questions) {
          await tx.sectionQuestion.update({
            where: {
              sectionId_questionId: {
                sectionId: sec.id,
                questionId: q.questionId
              }
            },
            data: {
              order: q.order
            }
          });
        }
      }
      return { success: true };
    });
  }

  // ── Duplicate Exam ──────────────────────────────────────────────────────────

  async duplicateExam(examId, instituteId, userId) {
    return prisma.$transaction(async (tx) => {
      const exam = await tx.exam.findFirst({
        where: { id: examId, instituteId, deletedAt: null },
        include: {
          settings: true,
          instructions: { orderBy: { order: 'asc' } },
          sections: {
            include: {
              questions: true
            }
          }
        }
      });

      if (!exam) throw new Error('EXAM_NOT_FOUND');

      const duplicatedExam = await tx.exam.create({
        data: {
          title: `${exam.title} (Copy)`,
          description: exam.description,
          status: 'DRAFT',
          version: 1,
          startDate: exam.startDate,
          endDate: exam.endDate,
          timezone: exam.timezone,
          resultReleasePolicy: exam.resultReleasePolicy,
          instituteId: exam.instituteId,
          creatorId: userId
        }
      });

      if (exam.settings) {
        await tx.examSetting.create({
          data: {
            examId: duplicatedExam.id,
            shuffleQuestions: exam.settings.shuffleQuestions,
            shuffleOptions: exam.settings.shuffleOptions,
            negativeMarking: exam.settings.negativeMarking,
            autoSubmit: exam.settings.autoSubmit,
            password: exam.settings.password,
            fullscreenEnforcement: exam.settings.fullscreenEnforcement,
            allowNavigation: exam.settings.allowNavigation,
            allowReview: exam.settings.allowReview,
            randomQuestionOrder: exam.settings.randomQuestionOrder,
            multipleAttempts: exam.settings.multipleAttempts,
            maxAttempts: exam.settings.maxAttempts,
            calculatorAllowed: exam.settings.calculatorAllowed,
            copyPasteRestriction: exam.settings.copyPasteRestriction,
            webcamRequirement: exam.settings.webcamRequirement
          }
        });
      }

      if (exam.instructions.length > 0) {
        await tx.examInstruction.createMany({
          data: exam.instructions.map((inst) => ({
            examId: duplicatedExam.id,
            text: inst.text,
            order: inst.order
          }))
        });
      }

      for (const section of exam.sections) {
        const duplicatedSection = await tx.section.create({
          data: {
            examId: duplicatedExam.id,
            title: section.title,
            description: section.description,
            type: section.type,
            order: section.order
          }
        });

        if (section.questions.length > 0) {
          await tx.sectionQuestion.createMany({
            data: section.questions.map((q) => ({
              sectionId: duplicatedSection.id,
              questionId: q.questionId,
              order: q.order
            }))
          });
        }
      }

      return duplicatedExam;
    });
  }

  // ── Sandbox Preview Mode ────────────────────────────────────────────────────

  async previewExam(examId, instituteId, userId) {
    return prisma.$transaction(async (tx) => {
      const exam = await tx.exam.findFirst({
        where: { id: examId, instituteId, deletedAt: null },
        include: {
          settings: true,
          instructions: { orderBy: { order: 'asc' } },
          sections: {
            orderBy: { order: 'asc' },
            include: {
              questions: {
                orderBy: { order: 'asc' },
                include: {
                  question: {
                    include: {
                      options: true,
                      codingQuestion: { include: { testCases: true } },
                      descriptiveQuestion: true
                    }
                  }
                }
              }
            }
          }
        }
      });

      if (!exam) throw new Error('EXAM_NOT_FOUND');

      // Purge old preview snapshots for this user
      await tx.examVersion.deleteMany({
        where: { examId, version: 0 }
      });

      let totalMarks = 0;
      exam.sections.forEach((sec) => {
        sec.questions.forEach((q) => {
          totalMarks += q.question.marks;
        });
      });

      const examVersion = await tx.examVersion.create({
        data: {
          examId,
          version: 0,
          title: `[PREVIEW] ${exam.title}`,
          description: exam.description,
          duration: exam.settings?.autoSubmit ? 120 : 180,
          maxMarks: totalMarks,
          passingMarks: totalMarks * 0.4,
          startDate: new Date(Date.now() - 3600000), // Active immediately
          endDate: new Date(Date.now() + 86400000),
          timezone: exam.timezone,
          settingsSnapshot: exam.settings || {},
          instructionsSnapshot: exam.instructions.map((i) => i.text)
        }
      });

      for (const section of exam.sections) {
        const versionSection = await tx.examVersionSection.create({
          data: {
            examVersionId: examVersion.id,
            title: section.title,
            description: section.description,
            type: section.type,
            order: section.order
          }
        });

        const questionsData = [];
        for (const secQ of section.questions) {
          const q = secQ.question;
          questionsData.push({
            sectionId: versionSection.id,
            originalQuestionId: q.id,
            title: q.title,
            text: q.text,
            type: q.type,
            marks: q.marks,
            negativeMarks: q.negativeMarks,
            explanation: q.explanation,
            difficulty: q.difficulty,
            order: secQ.order,
            mcqOptions: q.options.map((o) => ({ id: o.id, text: o.text, isCorrect: o.isCorrect, order: o.order })),
            codingDetails: q.codingQuestion ? {
              constraints: q.codingQuestion.constraints,
              inputFormat: q.codingQuestion.inputFormat,
              outputFormat: q.codingQuestion.outputFormat,
              starterCode: q.codingQuestion.starterCode,
              timeLimit: q.codingQuestion.timeLimit,
              memoryLimit: q.codingQuestion.memoryLimit,
              testCases: q.codingQuestion.testCases.map((tc) => ({ id: tc.id, input: tc.input, expectedOutput: tc.expectedOutput, isSample: tc.isSample, weight: tc.weight }))
            } : null,
            descriptiveDetails: q.descriptiveQuestion ? {
              wordLimit: q.descriptiveQuestion.wordLimit,
              charLimit: q.descriptiveQuestion.charLimit,
              rubric: q.descriptiveQuestion.rubric,
              sampleAnswer: q.descriptiveQuestion.sampleAnswer,
              allowFileUpload: q.descriptiveQuestion.allowFileUpload,
              maxFileSize: q.descriptiveQuestion.maxFileSize,
              allowedExtensions: q.descriptiveQuestion.allowedExtensions
            } : null
          });
        }

        if (questionsData.length > 0) {
          await tx.examVersionQuestion.createMany({
            data: questionsData
          });
        }
      }

      // Purge old preview attempts for this user
      await tx.attempt.deleteMany({
        where: { userId, examVersionId: examVersion.id }
      });

      const attempt = await tx.attempt.create({
        data: {
          userId,
          examVersionId: examVersion.id,
          status: 'IN_PROGRESS',
          startTime: new Date()
        }
      });

      const answersData = [];
      const versionQuestions = await tx.examVersionQuestion.findMany({
        where: { section: { examVersionId: examVersion.id } }
      });

      for (const question of versionQuestions) {
        answersData.push({
          attemptId: attempt.id,
          questionId: question.id,
          visited: false,
          flagged: false,
          score: 0.0,
          isGraded: false
        });
      }

      if (answersData.length > 0) {
        await tx.answer.createMany({
          data: answersData
        });
      }

      return tx.attempt.findUnique({
        where: { id: attempt.id },
        include: {
          examVersion: {
            include: {
              sections: {
                orderBy: { order: 'asc' },
                include: { questions: { orderBy: { order: 'asc' } } }
              }
            }
          },
          answers: true
        }
      });
    });
  }
}

module.exports = new ExamService();
