'use strict';

class AppError extends Error {
  constructor(message, statusCode, errorCode) {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message = 'Validation failed') {
    super(message, 400, 'VALIDATION_ERROR');
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404, 'NOT_FOUND');
  }
}

class ConflictError extends AppError {
  constructor(message = 'Resource conflict (Optimistic Lock mismatch)') {
    super(message, 409, 'VERSION_CONFLICT');
  }
}

class ExamLockedError extends AppError {
  constructor(message = 'Exam is published or archived and cannot be edited') {
    super(message, 423, 'EXAM_LOCKED');
  }
}

class AttemptExpiredError extends AppError {
  constructor(message = 'Exam duration timer or deadline has expired') {
    super(message, 403, 'ATTEMPT_EXPIRED');
  }
}

class CodingExecutionError extends AppError {
  constructor(message = 'Sandboxed code execution failed') {
    super(message, 502, 'CODING_EXECUTION_FAILED');
  }
}

module.exports = {
  AppError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ExamLockedError,
  AttemptExpiredError,
  CodingExecutionError
};
