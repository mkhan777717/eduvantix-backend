'use strict';

/**
 * Submission module pagination configuration.
 */
module.exports = {
  strategy: 'offset',
  defaultLimit: 20,
  maxLimit: 100,
  searchFields: ['code'],
  customSearchBuilder: null,
  sortableFields: ['createdAt', 'executionTime', 'status'],
  defaultSort: 'createdAt',
  defaultOrder: 'desc',
  filterableFields: ['userId', 'problemId', 'status', 'language'],
  defaultFilters: {},
  select: null,
  include: {
    user: {
      select: {
        id: true,
        username: true,
        instituteId: true,
      },
    },
    problem: {
      select: {
        id: true,
        title: true,
        slug: true,
      },
    },
  },
  serializer: (items) => items,
};
