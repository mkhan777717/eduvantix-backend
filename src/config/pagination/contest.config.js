'use strict';

/**
 * Contest pagination configuration.
 */
module.exports = {
  strategy: 'offset',
  defaultLimit: 20,
  maxLimit: 100,
  searchFields: ['title', 'description', 'category', 'slug'],
  customSearchBuilder: null,
  sortableFields: ['title', 'startTime', 'endTime', 'createdAt'],
  defaultSort: 'startTime',
  defaultOrder: 'desc',
  filterableFields: ['category', 'visibility'],
  defaultFilters: {},
  select: {
    id: true,
    slug: true,
    title: true,
    description: true,
    category: true,
    startTime: true,
    endTime: true,
    visibility: true,
    createdAt: true,
    instituteId: true,
    creator: { select: { username: true } },
    contestProblems: { select: { points: true } },
  },
  include: null,
  serializer: (items) => {
    return items.map((contest) => {
      const { id, instituteId, ...rest } = contest;
      return rest;
    });
  },
};
