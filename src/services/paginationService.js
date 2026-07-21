'use strict';

/**
 * paginationService.js
 *
 * Reusable, production-grade PaginationService following clean architecture.
 * Shared across all modules (Problems, Contests, Quizzes, Users, Submissions, Institutes, Viva).
 */

const {
  parsePaginationParams,
  buildSearchQuery,
  buildFilterQuery,
  buildSortQuery,
  buildCombinedWhere,
} = require('./queryBuilder');

class PaginationService {
  /**
   * Paginate a Prisma model using configuration, query parameters, and optional scope overrides.
   *
   * @param {Object} params
   * @param {Object} params.model             - Prisma model delegate (e.g. prisma.problem)
   * @param {Object} params.query             - Express req.query object
   * @param {Object} params.config            - Module pagination configuration
   * @param {Object} [params.where={}]        - Additional base where clause (e.g. institute scope)
   * @param {Object} [params.select]          - Override select fields
   * @param {Object} [params.include]         - Override include relations
   * @param {Function} [params.transform]     - Custom post-fetch serializer/transformer
   * @param {Object} [params.ctx={}]          - Execution context (e.g. { user: req.user })
   * @returns {Promise<{ success: boolean, data: Array, pagination: Object }>}
   */
  static async paginate({
    model,
    query = {},
    config = {},
    where: baseWhere = {},
    select = undefined,
    include = undefined,
    transform = undefined,
    ctx = {},
  }) {
    if (!model || typeof model.findMany !== 'function' || typeof model.count !== 'function') {
      throw new Error('PaginationService.paginate: A valid Prisma model delegate is required.');
    }

    // 1. Parse pagination parameters
    const { page, limit, skip, take } = parsePaginationParams(query, config);

    // 2. Build search, filter, and sort queries
    const searchWhere = buildSearchQuery(
      query.search,
      config.searchFields,
      config.customSearchBuilder
    );

    const filterWhere = buildFilterQuery(
      query,
      config.filterableFields,
      config.defaultFilters
    );

    const orderBy = buildSortQuery(
      query.sort,
      query.order,
      config.sortableFields,
      config.defaultSort,
      config.defaultOrder
    );

    // 3. Combine clauses via AND
    const combinedWhere = buildCombinedWhere(baseWhere, searchWhere, filterWhere);

    // 4. Determine field selection / inclusion from params or config
    const effectiveSelect = select !== undefined ? select : config.select;
    const effectiveInclude = include !== undefined ? include : config.include;

    // Prisma findMany query arguments
    const findManyOptions = {
      where: combinedWhere,
      orderBy,
      skip,
      take,
    };

    if (effectiveSelect) {
      findManyOptions.select = effectiveSelect;
    } else if (effectiveInclude) {
      findManyOptions.include = effectiveInclude;
    }

    // 5. Run Prisma queries in parallel
    const [rawItems, total] = await Promise.all([
      model.findMany(findManyOptions),
      model.count({ where: combinedWhere }),
    ]);

    // 6. Apply serialization / transformation layer
    let data = rawItems;
    if (typeof transform === 'function') {
      data = transform(rawItems, ctx);
    } else if (typeof config.serializer === 'function') {
      data = config.serializer(rawItems, ctx);
    }

    // 7. Calculate pagination metadata
    const totalPages = Math.ceil(total / limit) || (total === 0 ? 0 : 1);
    const hasNext = page < totalPages;
    const hasPrev = page > 1 && totalPages > 0;
    const nextPage = hasNext ? page + 1 : null;
    const prevPage = hasPrev ? page - 1 : null;

    return {
      success: true,
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext,
        hasPrev,
        nextPage,
        prevPage,
      },
      // Backward-compatibility root aliases for legacy frontend components:
      count: total,
      problems: data,
      contests: data,
      questions: data,
      members: data,
      users: data,
      admins: data,
      submissions: data,
      institutes: data,
      vivas: data,
      sessions: data,
      participations: data,
    };
  }
}

module.exports = PaginationService;
