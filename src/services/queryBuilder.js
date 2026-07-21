'use strict';

/**
 * queryBuilder.js
 *
 * Utility functions for parsing, validating, and building Prisma-compatible
 * search, filter, sort, and pagination query clauses.
 */

/**
 * Parse and validate page & limit against module config defaults.
 *
 * @param {Object} query  - Express req.query
 * @param {Object} config - Module pagination config
 * @returns {{ page: number, limit: number, skip: number, take: number }}
 */
function parsePaginationParams(query, config = {}) {
  const defaultLimit = config.defaultLimit || 20;
  const maxLimit = config.maxLimit || 100;

  let page = parseInt(query.page, 10);
  if (isNaN(page) || page < 1) {
    page = 1;
  }

  let limit = parseInt(query.limit, 10);
  if (isNaN(limit) || limit < 1) {
    limit = defaultLimit;
  } else if (limit > maxLimit) {
    limit = maxLimit;
  }

  const skip = (page - 1) * limit;
  const take = limit;

  return { page, limit, skip, take };
}

/**
 * Build Prisma search clause using custom builder or default multi-field insensitive OR query.
 *
 * @param {string} search
 * @param {Array<string>} searchFields
 * @param {Function|null} customSearchBuilder
 * @returns {Object} Prisma search condition or empty object
 */
function buildSearchQuery(search, searchFields = [], customSearchBuilder = null) {
  if (!search || typeof search !== 'string' || search.trim() === '') {
    return {};
  }

  const term = search.trim();

  if (typeof customSearchBuilder === 'function') {
    return customSearchBuilder(term);
  }

  if (!Array.isArray(searchFields) || searchFields.length === 0) {
    return {};
  }

  return {
    OR: searchFields.map((field) => ({
      [field]: { contains: term, mode: 'insensitive' },
    })),
  };
}

/**
 * Parse value string into number, boolean, or trimmed string.
 */
function parseFilterValue(val) {
  if (typeof val !== 'string') return val;
  const trimmed = val.trim();
  if (trimmed.toLowerCase() === 'true') return true;
  if (trimmed.toLowerCase() === 'false') return false;
  if (/^-?\d+$/.test(trimmed)) return parseInt(trimmed, 10);
  if (/^-?\d+\.\d+$/.test(trimmed)) return parseFloat(trimmed);
  return trimmed;
}

/**
 * Build filter query by whitelisting parameters against `filterableFields`.
 *
 * @param {Object} query            - req.query
 * @param {Array<string>} filterableFields - Whitelisted filter fields
 * @param {Object} defaultFilters   - Default filters from config
 * @returns {Object} Prisma filter object
 */
function buildFilterQuery(query = {}, filterableFields = [], defaultFilters = {}) {
  const filterClause = { ...defaultFilters };

  if (!Array.isArray(filterableFields) || filterableFields.length === 0) {
    return filterClause;
  }

  for (const field of filterableFields) {
    if (query[field] !== undefined && query[field] !== null && query[field] !== '') {
      filterClause[field] = parseFilterValue(query[field]);
    }
  }

  return filterClause;
}

/**
 * Build Prisma `orderBy` clause validating against whitelisted `sortableFields`.
 *
 * @param {string} sort
 * @param {string} order
 * @param {Array<string>} sortableFields
 * @param {string} defaultSort
 * @param {string} defaultOrder
 * @returns {Object} Prisma orderBy object
 */
function buildSortQuery(
  sort,
  order,
  sortableFields = [],
  defaultSort = 'createdAt',
  defaultOrder = 'desc'
) {
  const sortField =
    typeof sort === 'string' && sortableFields.includes(sort.trim())
      ? sort.trim()
      : defaultSort;

  const sortOrder =
    typeof order === 'string' && ['asc', 'desc'].includes(order.trim().toLowerCase())
      ? order.trim().toLowerCase()
      : defaultOrder;

  return { [sortField]: sortOrder };
}

/**
 * Combine baseWhere, searchWhere, and filterWhere using Prisma `AND`.
 *
 * @param {Object} baseWhere
 * @param {Object} searchWhere
 * @param {Object} filterWhere
 * @returns {Object} Combined Prisma where clause
 */
function buildCombinedWhere(baseWhere = {}, searchWhere = {}, filterWhere = {}) {
  const clauses = [baseWhere, searchWhere, filterWhere].filter(
    (clause) => clause && Object.keys(clause).length > 0
  );

  if (clauses.length === 0) return {};
  if (clauses.length === 1) return clauses[0];

  return { AND: clauses };
}

module.exports = {
  parsePaginationParams,
  buildSearchQuery,
  buildFilterQuery,
  buildSortQuery,
  buildCombinedWhere,
};
