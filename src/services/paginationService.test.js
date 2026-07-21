'use strict';

/**
 * paginationService.test.js
 *
 * Unit test suite for PaginationService and queryBuilder functions.
 * Tests:
 *  - Page validation (defaults, string parsing, < 1 inputs)
 *  - Limit validation (defaults, string parsing, capping at maxLimit)
 *  - Search query construction (default insensitive OR, customSearchBuilder)
 *  - Filter query construction (whitelisting, type parsing for booleans/numbers)
 *  - Sort query construction (whitelisting sortableFields, default order)
 *  - Combined WHERE clause generation (AND merging)
 *  - Metadata calculation (totalPages, hasNext, hasPrev, nextPage, prevPage)
 *  - Custom serializer execution
 *
 * Run via: node src/services/paginationService.test.js
 */

const {
  parsePaginationParams,
  buildSearchQuery,
  buildFilterQuery,
  buildSortQuery,
  buildCombinedWhere,
} = require('./queryBuilder');

const PaginationService = require('./paginationService');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${label}`);
    failed++;
  }
}

async function testGroup(name, fn) {
  console.log(`\n${name}`);
  try {
    await fn();
  } catch (err) {
    console.error(`  ❌ THREW ERROR: ${err.message}`);
    failed++;
  }
}

(async () => {

  // ── 1. Page & Limit Validation ──────────────────────────────────────────────
  await testGroup('1. Page & Limit Validation', () => {
    const config = { defaultLimit: 20, maxLimit: 100 };

    const defaults = parsePaginationParams({}, config);
    assert(defaults.page === 1, 'Default page is 1');
    assert(defaults.limit === 20, 'Default limit is 20');
    assert(defaults.skip === 0, 'Default skip is 0');
    assert(defaults.take === 20, 'Default take is 20');

    const invalidPage = parsePaginationParams({ page: '-5', limit: '15' }, config);
    assert(invalidPage.page === 1, 'Invalid page -5 falls back to 1');
    assert(invalidPage.limit === 15, 'Limit 15 parsed correctly');
    assert(invalidPage.skip === 0, 'Skip is 0 for fallback page 1');

    const exceedLimit = parsePaginationParams({ page: '3', limit: '500' }, config);
    assert(exceedLimit.page === 3, 'Page 3 parsed');
    assert(exceedLimit.limit === 100, 'Limit 500 capped at maxLimit 100');
    assert(exceedLimit.skip === 200, 'Skip is 200 for page 3 with limit 100');
  });

  // ── 2. Search Query Construction ───────────────────────────────────────────
  await testGroup('2. Search Query Construction', () => {
    const emptySearch = buildSearchQuery('', ['title', 'slug']);
    assert(Object.keys(emptySearch).length === 0, 'Empty search returns empty object');

    const defaultSearch = buildSearchQuery('tree', ['title', 'slug']);
    assert(Array.isArray(defaultSearch.OR), 'OR array created');
    assert(defaultSearch.OR.length === 2, 'Two OR conditions created');
    assert(defaultSearch.OR[0].title.contains === 'tree', 'First condition title contains "tree"');
    assert(defaultSearch.OR[0].title.mode === 'insensitive', 'Insensitive mode applied');

    const customFn = (term) => ({ customField: { equals: term } });
    const customSearch = buildSearchQuery('myterm', ['title'], customFn);
    assert(customSearch.customField.equals === 'myterm', 'Custom search builder used');
  });

  // ── 3. Filter Query Construction ───────────────────────────────────────────
  await testGroup('3. Filter Query Construction', () => {
    const filterableFields = ['difficulty', 'visibility', 'isBlocked', 'level'];
    const defaultFilters = { visibility: 'PUBLIC' };
    const query = { difficulty: 'EASY', isBlocked: 'true', level: '5', unallowedField: 'hack' };

    const filters = buildFilterQuery(query, filterableFields, defaultFilters);

    assert(filters.visibility === 'PUBLIC', 'Default filter preserved');
    assert(filters.difficulty === 'EASY', 'Whitelisted string filter included');
    assert(filters.isBlocked === true, 'Boolean string parsed to boolean true');
    assert(filters.level === 5, 'Number string parsed to integer 5');
    assert(filters.unallowedField === undefined, 'Unwhitelisted field ignored');
  });

  // ── 4. Sort Query Construction ──────────────────────────────────────────────
  await testGroup('4. Sort Query Construction', () => {
    const sortableFields = ['title', 'createdAt', 'score'];

    const validSort = buildSortQuery('score', 'asc', sortableFields);
    assert(validSort.score === 'asc', 'Valid sort field and order accepted');

    const invalidSort = buildSortQuery('unknownField', 'asc', sortableFields, 'createdAt', 'desc');
    assert(invalidSort.createdAt === 'asc', 'Invalid sort field falls back to defaultSort');

    const invalidOrder = buildSortQuery('title', 'INVALID', sortableFields, 'createdAt', 'desc');
    assert(invalidOrder.title === 'desc', 'Invalid order falls back to defaultOrder');
  });

  // ── 5. Combined WHERE Clause Generation (AND merging) ──────────────────────
  await testGroup('5. Combined WHERE Clause Generation', () => {
    const baseWhere = { instituteId: 10 };
    const searchWhere = { OR: [{ title: { contains: 'test' } }] };
    const filterWhere = { difficulty: 'HARD' };

    const combined = buildCombinedWhere(baseWhere, searchWhere, filterWhere);
    assert(Array.isArray(combined.AND), 'AND array generated');
    assert(combined.AND.length === 3, 'All 3 non-empty clauses merged into AND array');

    const singleClause = buildCombinedWhere(baseWhere, {}, {});
    assert(singleClause.instituteId === 10, 'Single clause returned directly without unnecessary AND wrapper');
  });

  // ── 6. PaginationService execution with mock model ─────────────────────────
  await testGroup('6. PaginationService Execution & Metadata', async () => {
    const mockData = [
      { id: 1, title: 'Problem 1' },
      { id: 2, title: 'Problem 2' },
    ];

    const mockModel = {
      findMany: async (opts) => mockData,
      count: async (opts) => 45,
    };

    const config = {
      defaultLimit: 20,
      maxLimit: 100,
      searchFields: ['title'],
      sortableFields: ['title', 'createdAt'],
      filterableFields: ['difficulty'],
      serializer: (items) => items.map((i) => ({ ...i, serialized: true })),
    };

    const result = await PaginationService.paginate({
      model: mockModel,
      query: { page: '2', limit: '20' },
      config,
    });

    assert(result.success === true, 'Response success is true');
    assert(result.data.length === 2, 'Returned 2 items');
    assert(result.data[0].serialized === true, 'Serializer layer executed');
    assert(result.pagination.page === 2, 'Page is 2');
    assert(result.pagination.limit === 20, 'Limit is 20');
    assert(result.pagination.total === 45, 'Total is 45');
    assert(result.pagination.totalPages === 3, 'Total pages is 3');
    assert(result.pagination.hasNext === true, 'hasNext is true');
    assert(result.pagination.hasPrev === true, 'hasPrev is true');
    assert(result.pagination.nextPage === 3, 'nextPage is 3');
    assert(result.pagination.prevPage === 1, 'prevPage is 1');
  });

  // ── 7. Boundary Conditions & Empty Results ─────────────────────────────────
  await testGroup('7. Empty Results Metadata', async () => {
    const mockModelEmpty = {
      findMany: async () => [],
      count: async () => 0,
    };

    const result = await PaginationService.paginate({
      model: mockModelEmpty,
      query: { page: '1', limit: '20' },
      config: { defaultLimit: 20 },
    });

    assert(result.data.length === 0, 'Data array is empty');
    assert(result.pagination.total === 0, 'Total count is 0');
    assert(result.pagination.totalPages === 0, 'Total pages is 0');
    assert(result.pagination.hasNext === false, 'hasNext is false');
    assert(result.pagination.hasPrev === false, 'hasPrev is false');
    assert(result.pagination.nextPage === null, 'nextPage is null');
    assert(result.pagination.prevPage === null, 'prevPage is null');
  });

  console.log('\n=================================================');
  console.log(` PaginationService Unit Tests Result`);
  console.log(`   Passed: ${passed}`);
  console.log(`   Failed: ${failed}`);
  console.log('=================================================\n');

  if (failed > 0) process.exit(1);
})();
