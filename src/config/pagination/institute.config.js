'use strict';

/**
 * Institute module pagination configuration.
 */
module.exports = {
  strategy: 'offset',
  defaultLimit: 20,
  maxLimit: 100,
  searchFields: ['name'],
  customSearchBuilder: null,
  sortableFields: ['name', 'createdAt', 'isBlocked'],
  defaultSort: 'createdAt',
  defaultOrder: 'desc',
  filterableFields: ['isBlocked'],
  defaultFilters: {},
  select: {
    id: true,
    name: true,
    isBlocked: true,
    createdAt: true,
    updatedAt: true,
    _count: {
      select: {
        users: true,
        batches: true,
        problems: true,
        contests: true,
      },
    },
  },
  include: null,
  serializer: (items) => items,
};
