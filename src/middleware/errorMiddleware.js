const errorHandler = (err, req, res, next) => {
  console.error('Error Details:', {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    error: err
  });

  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';

  // Handle Prisma Database Errors
  if (err.name === 'PrismaClientInitializationError' || err.code === 'P1001' || err.code === 'P1008' || err.code === 'P1017') {
    return res.status(503).json({
      success: false,
      message: 'Database is currently unavailable. Please try again in a moment.'
    });
  }

  if (err.code) {
    switch (err.code) {
      case 'P2002': {
        // Unique constraint violation
        statusCode = 400;
        const field = err.meta?.target ? err.meta.target.join(', ') : 'field';
        message = `A record with this ${field} already exists.`;
        break;
      }
      case 'P2025': {
        // Record not found
        statusCode = 404;
        message = err.meta?.cause || 'The requested record was not found.';
        break;
      }
      case 'P2003': {
        // Foreign key constraint failure
        statusCode = 400;
        message = 'Database integrity error: A referenced record does not exist.';
        break;
      }
      default:
        statusCode = 500;
        message = 'A database error occurred.';
    }
  }

  // Handle Zod Validation Errors
  if (err.name === 'ZodError') {
    statusCode = 400;
    const errors = err.errors.map(e => ({
      field: e.path.join('.'),
      message: e.message
    }));
    return res.status(statusCode).json({
      success: false,
      message: 'Validation failed.',
      errors
    });
  }

  // Handle JSON parsing errors
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      success: false,
      message: 'Invalid JSON payload format.'
    });
  }

  res.status(statusCode).json({
    success: false,
    message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
};

module.exports = {
  errorHandler
};
