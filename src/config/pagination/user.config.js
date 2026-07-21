'use strict';

/**
 * User module pagination configuration.
 */
module.exports = {
  strategy: 'offset',
  defaultLimit: 20,
  maxLimit: 100,
  searchFields: ['username', 'email'],
  customSearchBuilder: null,
  sortableFields: ['username', 'email', 'role', 'createdAt'],
  defaultSort: 'createdAt',
  defaultOrder: 'desc',
  filterableFields: ['role', 'instituteId'],
  defaultFilters: {},
  select: {
    id: true,
    username: true,
    email: true,
    role: true,
    createdAt: true,
    instituteId: true,
    institute: {
      select: { id: true, name: true }
    },
    batchesStudied: { select: { id: true, name: true } },
    batchesTaught: { select: { id: true, name: true } },
    managedBatches: { select: { id: true, name: true } },
  },
  include: null,
  serializer: (items) => items,
};
