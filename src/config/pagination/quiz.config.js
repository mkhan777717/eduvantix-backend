'use strict';

/**
 * Quiz / Arcade Question pagination configuration.
 */
module.exports = {
  strategy: 'offset',
  defaultLimit: 20,
  maxLimit: 100,
  searchFields: ['title', 'question', 'track', 'term'],
  customSearchBuilder: (search) => ({
    OR: [
      { title: { contains: search, mode: 'insensitive' } },
      { question: { contains: search, mode: 'insensitive' } },
      { track: { contains: search, mode: 'insensitive' } },
      { term: { contains: search, mode: 'insensitive' } },
    ],
  }),
  sortableFields: ['title', 'level', 'createdAt', 'updatedAt'],
  defaultSort: 'createdAt',
  defaultOrder: 'desc',
  filterableFields: ['type', 'track', 'level'],
  defaultFilters: {},
  select: null,
  include: null,
  serializer: (items) => items,
};
