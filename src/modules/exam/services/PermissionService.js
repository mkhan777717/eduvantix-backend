'use strict';

/**
 * PermissionService
 * Centralizes authentication role checks (RBAC) and permissions scoping.
 */
class PermissionService {
  /**
   * Checks if user has teacher-level access.
   * @param {object} user - Request user object (role)
   * @returns {boolean}
   */
  isTeacher(user) {
    return user.role === 'ADMIN' || user.role === 'MENTOR' || user.role === 'INSTITUTE_ADMIN';
  }

  /**
   * Checks if user is allowed to edit or publish exam drafts.
   * @param {object} user - Request user
   * @param {object} exam - Exam record
   * @returns {boolean}
   */
  canModifyExam(user, exam) {
    if (!this.isTeacher(user)) return false;
    // Check if creator matches or user is an admin / institute admin for that institute
    if (user.role === 'ADMIN') return true;
    return exam.instituteId === user.instituteId;
  }

  /**
   * Checks if user is allowed to view candidate attempt details (teachers only).
   * @param {object} user - Request user
   * @param {object} attempt - Candidate attempt record
   * @returns {boolean}
   */
  canGradeAttempt(user, attempt) {
    return this.isTeacher(user);
  }

  /**
   * Checks if user is allowed to view results.
   * @param {object} user - Request user
   * @param {object} result - Result record
   * @returns {boolean}
   */
  canViewResult(user, result) {
    if (this.isTeacher(user)) return true;
    // If student, check if they own the attempt and the result is published
    return result.attempt.userId === user.id && result.published;
  }
}

module.exports = new PermissionService();
