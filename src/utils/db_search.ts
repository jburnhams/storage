export interface SearchResult {
  sql: string;
  params: any[];
}

export function buildSqlSearch(
  tableName: string,
  queryParams: Record<string, string>,
  allowedColumns: string[]
): SearchResult {
  const whereClauses: string[] = [];
  const params: any[] = [];
  const validOps = ['eq', 'neq', 'lt', 'lte', 'gt', 'gte', 'contains'];

  // Extract special params
  let limit = 50;
  if (queryParams.limit) {
    const l = parseInt(queryParams.limit);
    if (!isNaN(l) && l > 0) limit = l;
  }

  let offset = 0;
  if (queryParams.offset) {
    const o = parseInt(queryParams.offset);
    if (!isNaN(o) && o >= 0) offset = o;
  }

  let orderBy = 'created_at'; // Default
  let orderDir = 'DESC';

  if (queryParams.sort_by) {
    if (queryParams.sort_by === 'random') {
      orderBy = 'RANDOM()';
      orderDir = ''; // Random doesn't use ASC/DESC in the same way usually, but usually strictly RANDOM()
    } else if (allowedColumns.includes(queryParams.sort_by) || queryParams.sort_by.includes('.')) {
      // Allow sorting by valid columns or JSON paths if the base column is allowed
      const parts = queryParams.sort_by.split('.');
      if (parts.length === 1 && allowedColumns.includes(parts[0])) {
        orderBy = parts[0];
      } else if (parts.length > 1 && allowedColumns.includes(parts[0])) {
         // Handle JSON sort: json_extract(col, '$.path')
         const col = parts[0];
         const path = parts.slice(1).join('.');
         // Sanitize path to prevent injection
         if (/^[a-zA-Z0-9_.]+$/.test(path)) {
            orderBy = `json_extract(${col}, '$.${path}')`;
         }
      }
    }
  }

  if (queryParams.sort_order && ['asc', 'desc'].includes(queryParams.sort_order.toLowerCase())) {
    orderDir = queryParams.sort_order.toUpperCase();
  }

  // Iterate all params for filters
  for (const [key, value] of Object.entries(queryParams)) {
    if (['limit', 'offset', 'sort_by', 'sort_order'].includes(key)) continue;

    // Determine field and op
    // Strategy: Try to match known suffixes.
    // keys could be: "title_contains", "view_count_gt", "statistics.viewCount_gt"

    let field = key;
    let op = 'eq';

    for (const validOp of validOps) {
      if (key.endsWith(`_${validOp}`)) {
        op = validOp;
        field = key.slice(0, -1 * (validOp.length + 1));
        break;
      }
    }

    // Check if field is valid
    // It is valid if it is in allowedColumns OR it is a json path where root is in allowedColumns
    let sqlField = '';
    const parts = field.split('.');
    if (allowedColumns.includes(field)) {
      sqlField = field;
    } else if (parts.length > 1 && allowedColumns.includes(parts[0])) {
      // JSON extraction
      const col = parts[0];
      const path = parts.slice(1).join('.');
      // Sanitize path to prevent injection
      if (/^[a-zA-Z0-9_.]+$/.test(path)) {
        sqlField = `json_extract(${col}, '$.${path}')`;
      } else {
        continue;
      }
    } else {
      continue; // Invalid field, skip
    }

    // Add clause
    let sqlOp = '=';
    let paramValue = value;

    switch (op) {
      case 'eq': sqlOp = '='; break;
      case 'neq': sqlOp = '!='; break;
      case 'lt': sqlOp = '<'; break;
      case 'lte': sqlOp = '<='; break;
      case 'gt': sqlOp = '>'; break;
      case 'gte': sqlOp = '>='; break;
      case 'contains':
        sqlOp = 'LIKE';
        paramValue = `%${value}%`;
        break;
    }

    // For numeric comparisons on JSON text fields, we might need CAST if it's strictly numbers,
    // but SQLite is loose. However, if the user explicitly wants numeric comparison,
    // they pass a number string. D1/SQLite stores everything as text mostly if declared TEXT,
    // but json_extract returns values that can be mixed.
    // Let's rely on SQLite's affinity.

    whereClauses.push(`${sqlField} ${sqlOp} ?`);
    params.push(paramValue);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  // Construct final SQL
  // Note: D1 doesn't support named params in the binding list easily if we mix things,
  // but using '?' is standard.

  const orderSql = orderBy === 'RANDOM()' ? 'ORDER BY RANDOM()' : `ORDER BY ${orderBy} ${orderDir}`;

  const sql = `SELECT * FROM ${tableName} ${whereSql} ${orderSql} LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  return { sql, params };
}
