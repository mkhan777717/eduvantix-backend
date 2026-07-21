'use strict';

/**
 * Problem pagination configuration.
 */
module.exports = {
  strategy: 'offset',
  defaultLimit: 20,
  maxLimit: 100,
  searchFields: ['title', 'slug', 'statement'],
  customSearchBuilder: null,
  sortableFields: ['title', 'difficulty', 'createdAt', 'updatedAt'],
  defaultSort: 'createdAt',
  defaultOrder: 'desc',
  filterableFields: ['difficulty', 'visibility', 'category', 'judgeStrategy'],
  defaultFilters: {},
  select: {
    id: true,
    title: true,
    slug: true,
    difficulty: true,
    visibility: true,
    createdAt: true,
    updatedAt: true,
    category: true,
    judgeStrategy: true,
    instituteId: true,
    _count: {
      select: { testCases: true },
    },
  },
  include: null,
  serializer: (items, { user }) => {
    const isStaff = ['ADMIN', 'INSTITUTE_ADMIN', 'MENTOR', 'BATCH_MANAGER'].includes(user?.role);
    return items.map((problem) => {
      const { id, ...rest } = problem;
      if (!isStaff) {
        delete rest.solution;
        delete rest.editorial;
        delete rest.evaluation;
      }
      return {
        ...rest,
        testCasesCount: problem._count?.testCases ?? 0,
      };
    });
  },
};
