# Reusable Pagination, Search, Filtering & Sorting System — API Documentation

This document describes the unified, production-grade pagination, search, filtering, and sorting system powering the DMX Academy backend across all modules.

---

## 1. Overview & Architecture

All list endpoints in the system delegate pagination, search, filtering, sorting, and field serialization to `PaginationService`.

```
Request (?page=1&limit=20&search=term&sort=field&order=asc|desc)
  ↓
Router & Auth Middleware (protect, restrictTo)
  ↓
Resolver Middleware (resolveXxx, validateXxxAccess if applicable)
  ↓
Controller
  ↓
PaginationService.paginate({ model, query, config, where, ctx })
  ├── QueryBuilder: Whitelist validation & AND clause construction
  ├── Prisma: Parallel findMany() + count()
  └── Serializer: Module-specific output transformation
  ↓
Standardized JSON Response
```

---

## 2. Standardized Response Format

Every list endpoint returns the identical JSON envelope:

```json
{
  "success": true,
  "data": [
    { ... }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 523,
    "totalPages": 27,
    "hasNext": true,
    "hasPrev": false,
    "nextPage": 2,
    "prevPage": null
  }
}
```

### Response Properties

| Property | Type | Description |
|---|---|---|
| `success` | boolean | Always `true` for successful queries. |
| `data` | Array<Object> | Array of serialized record items for the current page. |
| `pagination.page` | number | Current page number (1-indexed). |
| `pagination.limit` | number | Page size (items returned per page). |
| `pagination.total` | number | Total count of matching records across all pages. |
| `pagination.totalPages` | number | Total number of available pages. |
| `pagination.hasNext` | boolean | `true` if a subsequent page exists. |
| `pagination.hasPrev` | boolean | `true` if a previous page exists. |
| `pagination.nextPage` | number \| null | Next page number, or `null` if on the last page. |
| `pagination.prevPage` | number \| null | Previous page number, or `null` if on page 1. |

---

## 3. Query Parameter Specification

Every list endpoint automatically accepts and parses the following query parameters:

| Parameter | Type | Default | Max | Description |
|---|---|---|---|---|
| `page` | integer | `1` | — | Target page number (values < 1 fall back to 1). |
| `limit` | integer | Per-module (usually `20`) | `100` | Page size (values > 100 are capped at 100). |
| `search` | string | — | — | Case-insensitive search term across whitelisted search fields. |
| `sort` | string | Per-module default | — | Sort field (must be in module's `sortableFields` whitelist). |
| `order` | string | `desc` | — | Sort direction (`asc` or `desc`). |

---

## 4. Module Configuration & Whitelists

Configurations live in `src/config/pagination/`.

### 4.1 Problems (`/api/problems`)

- **Default Limit:** 20 (Max: 100)
- **Searchable Fields:** `title`, `slug`, `statement`
- **Sortable Fields:** `title`, `difficulty`, `createdAt`, `updatedAt` (Default: `createdAt desc`)
- **Filterable Fields:** `difficulty` (`EASY`, `MEDIUM`, `HARD`), `visibility` (`PUBLIC`, `PRIVATE`, `DRAFT`, `HIDDEN`), `category`, `judgeStrategy`

**Example Request:**
```http
GET /api/problems?page=1&limit=10&search=two&difficulty=EASY&sort=title&order=asc
```

---

### 4.2 Contests (`/api/contests`)

- **Default Limit:** 20 (Max: 100)
- **Searchable Fields:** `title`, `description`, `category`, `slug`
- **Sortable Fields:** `title`, `startTime`, `endTime`, `createdAt` (Default: `startTime desc`)
- **Filterable Fields:** `category`, `visibility`

**Example Request:**
```http
GET /api/contests?page=2&limit=10&sort=startTime&order=desc
```

---

### 4.3 Quizzes / Arcade Questions (`/api/arcade/questions`)

- **Default Limit:** 20 (Max: 100)
- **Searchable Fields:** `title`, `question`, `track`, `term` (uses custom search builder)
- **Sortable Fields:** `title`, `level`, `createdAt`, `updatedAt` (Default: `createdAt desc`)
- **Filterable Fields:** `type` (`quiz`, `match`, `fillin`, `debug`), `track`, `level`

**Example Request:**
```http
GET /api/arcade/questions?page=1&limit=20&type=quiz&track=JavaScript
```

---

### 4.4 Users (`/api/auth/users`, `/api/institutes/members`)

- **Default Limit:** 20 (Max: 100)
- **Searchable Fields:** `username`, `email`
- **Sortable Fields:** `username`, `email`, `role`, `createdAt` (Default: `createdAt desc`)
- **Filterable Fields:** `role` (`ADMIN`, `INSTITUTE_ADMIN`, `MENTOR`, `USER`, `BATCH_MANAGER`), `instituteId`

**Example Request:**
```http
GET /api/institutes/members?page=1&limit=15&role=MENTOR&search=john
```

---

### 4.5 Submissions (`/api/submissions`)

- **Default Limit:** 20 (Max: 100)
- **Searchable Fields:** `code`
- **Sortable Fields:** `createdAt`, `executionTime`, `status` (Default: `createdAt desc`)
- **Filterable Fields:** `userId`, `problemId`, `status` (`ACCEPTED`, `WRONG_ANSWER`, etc.), `language`

**Example Request:**
```http
GET /api/submissions?page=1&limit=20&status=ACCEPTED&language=CPP
```

---

### 4.6 Institutes (`/api/institutes`)

- **Default Limit:** 20 (Max: 100)
- **Searchable Fields:** `name`
- **Sortable Fields:** `name`, `createdAt`, `isBlocked` (Default: `createdAt desc`)
- **Filterable Fields:** `isBlocked` (`true`, `false`)

**Example Request:**
```http
GET /api/institutes?page=1&limit=10&isBlocked=false
```

---

### 4.7 Viva Sessions & Scheduled Vivas (`/api/viva/history`, `/api/viva/scheduled`)

- **Default Limit:** 20 (Max: 100)
- **Searchable Fields:** `subject`, `feedback`, `title`, `description`
- **Sortable Fields:** `score`, `createdAt`, `updatedAt`, `startTime` (Default: `createdAt desc`)
- **Filterable Fields:** `subject`, `status`, `userId`, `instituteId`, `creatorId`

**Example Request:**
```http
GET /api/viva/history?page=1&limit=5&sort=score&order=desc
```

---

## 5. Security & Input Sanitization

1. **SQL & Query Injection Protection:** Search, sort, and filter parameters are strictly checked against per-module whitelists. Unwhitelisted parameters in `req.query` are completely ignored.
2. **Page & Limit Caps:** Negative page inputs default to `1`. `limit` parameters exceeding `100` are automatically capped to `100`.
3. **Database Scoping Preservation:** Scope requirements (e.g. `instituteId`, student visibility filters) are combined with search and user filter clauses using Prisma `AND` arrays.

---

## 6. Frontend Integration Guidelines

To build UI components (e.g. React/Next.js table or list with pagination controls):

```javascript
async function fetchPage(pageNumber = 1, filters = {}) {
  const params = new URLSearchParams({
    page: pageNumber,
    limit: 20,
    ...filters,
  });

  const response = await fetch(`/api/problems?${params.toString()}`);
  const json = await response.json();

  if (json.success) {
    renderItems(json.data);
    updatePaginationUI(json.pagination);
  }
}
```
