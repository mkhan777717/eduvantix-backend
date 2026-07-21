'use strict';

/**
 * Viva Session & Scheduled Viva pagination configuration.
 */
module.exports = {
  strategy: 'offset',
  defaultLimit: 20,
  maxLimit: 100,
  searchFields: ['subject', 'feedback', 'title', 'description'],
  customSearchBuilder: null,
  sortableFields: ['score', 'createdAt', 'updatedAt', 'startTime'],
  defaultSort: 'createdAt',
  defaultOrder: 'desc',
  filterableFields: ['subject', 'status', 'userId', 'instituteId', 'creatorId'],
  defaultFilters: {},
  select: null,
  include: {
    user: { select: { id: true, username: true, email: true } },
    viva: { select: { id: true, title: true, subject: true } },
  },
  serializer: (items) => items,
};
