'use strict';

/**
 * ExamDto
 * Maps database entity models to sanitized API response structures.
 * Critically handles security stripping of correct answers and hidden cases for active candidates.
 */
class ExamDto {
  /**
   * Maps a raw exam database object.
   * @param {object} exam
   * @returns {object} Clean exam response
   */
  toExamResponse(exam, userAttempt = null) {
    if (!exam) return null;
    return {
      id: exam.id,
      title: exam.title,
      description: exam.description,
      status: exam.status,
      version: exam.version,
      currentVersionId: exam.currentVersionId,
      startDate: exam.startDate,
      endDate: exam.endDate,
      timezone: exam.timezone,
      resultReleasePolicy: exam.resultReleasePolicy,
      publishResultDate: exam.publishResultDate,
      settings: exam.settings ? {
        shuffleQuestions: exam.settings.shuffleQuestions,
        shuffleOptions: exam.settings.shuffleOptions,
        negativeMarking: exam.settings.negativeMarking,
        autoSubmit: exam.settings.autoSubmit,
        fullscreenEnforcement: exam.settings.fullscreenEnforcement,
        allowNavigation: exam.settings.allowNavigation,
        allowReview: exam.settings.allowReview,
        randomQuestionOrder: exam.settings.randomQuestionOrder,
        multipleAttempts: exam.settings.multipleAttempts,
        maxAttempts: exam.settings.maxAttempts,
        calculatorAllowed: exam.settings.calculatorAllowed,
        copyPasteRestriction: exam.settings.copyPasteRestriction,
        webcamRequirement: exam.settings.webcamRequirement
      } : null,
      instructions: exam.instructions ? exam.instructions.map(i => i.text) : [],
      sections: exam.sections || [],
      userAttempt: userAttempt ? {
        id: userAttempt.id,
        status: userAttempt.status,
        score: userAttempt.result?.published ? userAttempt.score : null,
        resultPublished: userAttempt.result?.published || false,
        createdAt: userAttempt.createdAt
      } : null,
      createdAt: exam.createdAt,
      updatedAt: exam.updatedAt
    };
  }

  /**
   * Sanitizes attempt payload depending on candidate status.
   * Strips correct answers, hidden cases, and grading rubrics from IN_PROGRESS students.
   * @param {object} attempt
   * @param {boolean} isTeacher - Request user role status
   * @returns {object} Clean attempt
   */
  toAttemptResponse(attempt, isTeacher = false) {
    if (!attempt) return null;

    const sections = attempt.examVersion?.sections?.map((section) => {
      const questions = section.questions?.map((q) => {
        // Strip MCQ correct flags if student is in progress
        let mcqOptions = q.mcqOptions;
        if (!isTeacher && attempt.status === 'IN_PROGRESS' && mcqOptions) {
          mcqOptions = mcqOptions.map((opt) => ({
            id: opt.id,
            text: opt.text,
            order: opt.order
            // EXCLUDES isCorrect flag!
          }));
        }

        // Strip Hidden test cases and expected outputs if student is in progress
        let codingDetails = q.codingDetails;
        if (!isTeacher && attempt.status === 'IN_PROGRESS' && codingDetails) {
          codingDetails = {
            constraints: codingDetails.constraints,
            inputFormat: codingDetails.inputFormat,
            outputFormat: codingDetails.outputFormat,
            starterCode: codingDetails.starterCode,
            timeLimit: codingDetails.timeLimit,
            memoryLimit: codingDetails.memoryLimit,
            // Only expose sample test cases, and hide expected output!
            testCases: codingDetails.testCases
              ? codingDetails.testCases
                  .filter((tc) => tc.isSample)
                  .map((tc) => ({
                    id: tc.id,
                    input: tc.input,
                    expectedOutput: tc.expectedOutput, // visible samples show output
                    isSample: true
                  }))
              : []
          };
        }

        // Strip essay rubrics and sample answers if student is in progress
        let descriptiveDetails = q.descriptiveDetails;
        if (!isTeacher && attempt.status === 'IN_PROGRESS' && descriptiveDetails) {
          descriptiveDetails = {
            wordLimit: descriptiveDetails.wordLimit,
            charLimit: descriptiveDetails.charLimit,
            allowFileUpload: descriptiveDetails.allowFileUpload,
            maxFileSize: descriptiveDetails.maxFileSize,
            allowedExtensions: descriptiveDetails.allowedExtensions
            // EXCLUDES rubric and sampleAnswer!
          };
        }

        return {
          id: q.id,
          originalQuestionId: q.originalQuestionId,
          title: q.title,
          text: q.text,
          type: q.type,
          marks: q.marks,
          order: q.order,
          mcqOptions,
          codingDetails,
          descriptiveDetails
        };
      });

      return {
        id: section.id,
        title: section.title,
        description: section.description,
        type: section.type,
        order: section.order,
        questions: questions || []
      };
    });

    return {
      id: attempt.id,
      examVersionId: attempt.examVersionId,
      userId: attempt.userId,
      startTime: attempt.startTime,
      endTime: attempt.endTime,
      status: attempt.status,
      score: isTeacher || attempt.status === 'SUBMITTED' || attempt.status === 'AUTO_SUBMITTED' ? attempt.score : undefined,
      examVersion: attempt.examVersion ? {
        id: attempt.examVersion.id,
        title: attempt.examVersion.title,
        description: attempt.examVersion.description,
        duration: attempt.examVersion.duration,
        maxMarks: attempt.examVersion.maxMarks,
        passingMarks: isTeacher ? attempt.examVersion.passingMarks : undefined,
        startDate: attempt.examVersion.startDate,
        endDate: attempt.examVersion.endDate,
        settingsSnapshot: attempt.examVersion.settingsSnapshot,
        instructionsSnapshot: attempt.examVersion.instructionsSnapshot,
        sections: sections || []
      } : null,
      answers: attempt.answers ? attempt.answers.map((ans) => ({
        id: ans.id,
        questionId: ans.questionId,
        visited: ans.visited,
        flagged: ans.flagged,
        // Responses are exposed
        mcqAnswers: ans.mcqAnswers ? ans.mcqAnswers.map(ma => ma.optionIdRef) : [],
        descriptiveAnswer: ans.descriptiveAnswer,
        descriptiveFileUrl: ans.descriptiveFileUrl,
        descriptiveFileName: ans.descriptiveFileName,
        codingCode: ans.codingCode,
        codingLanguage: ans.codingLanguage,
        // Grading details are hidden for active attempts
        score: isTeacher || attempt.status === 'SUBMITTED' || attempt.status === 'AUTO_SUBMITTED' ? ans.score : undefined,
        isGraded: isTeacher || attempt.status === 'SUBMITTED' || attempt.status === 'AUTO_SUBMITTED' ? ans.isGraded : undefined
      })) : []
    };
  }
}

module.exports = new ExamDto();
