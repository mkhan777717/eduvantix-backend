'use strict';

const attemptRepository = require('../repositories/AttemptRepository');

/**
 * AuditService
 * Centralizes logs generation for student actions, exam events, and teacher actions.
 */
class AuditService {
  /**
   * Log an audit event during exam runner execution.
   * @param {object} params
   * @param {number} params.attemptId - Attempt ID
   * @param {number} params.userId - Student or Instructor ID
   * @param {string} params.event - EventTypes value
   * @param {object} [params.metadata] - Extra JSON details
   * @returns {Promise<object>}
   */
  async log({ attemptId, userId, event, metadata = null }) {
    try {
      return await attemptRepository.logExamEvent(attemptId, userId, event, metadata);
    } catch (err) {
      console.error(`[AuditLog] Failed to log exam event '${event}':`, err.message);
      // Suppress log failure to ensure core attempt flows are not disrupted in production
      return null;
    }
  }

  /**
   * Log a security proctoring violation.
   * @param {object} params
   * @param {number} params.attemptId - Attempt ID
   * @param {number} params.userId - Student ID for verification
   * @param {string} params.event - Violation type (e.g. TAB_SWITCH)
   * @param {string} [params.severity='LOW'] - LOW, MEDIUM, HIGH
   * @param {object} [params.metadata]
   * @returns {Promise<object>}
   */
  async logProctorIncident({ attemptId, userId, event, severity = 'LOW', metadata = null }) {
    try {
      // Direct call to repository
      await attemptRepository.logProctorEvent(attemptId, event, severity, metadata);
      
      // Also register in general event log for unified timelines
      await this.log({
        attemptId,
        userId,
        event: 'PROCTOR_INCIDENT',
        metadata: { event, severity }
      });
      
      return { success: true };
    } catch (err) {
      console.error(`[AuditLog] Failed to log proctor incident '${event}':`, err.message);
      return null;
    }
  }
}

module.exports = new AuditService();
