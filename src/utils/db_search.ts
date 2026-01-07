export interface SearchResult {
  sql: string;
  params: any[];
  whereSql: string;
  orderSql: string;
  limit: number;
  offset: number;
  whereParams: any[];
}

export function buildSqlSearch(
  tableName: string,
  queryParams: Record<string, string>,
  allowedColumns: string[],
  tableAlias?: string
): SearchResult {
  const whereClauses: string[] = [];
  const whereParams: any[] = [];
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
  if (tableAlias) orderBy = `${tableAlias}.created_at`;

  let orderDir = 'DESC';

  if (queryParams.sort_by) {
    if (queryParams.sort_by === 'random') {
      orderBy = 'RANDOM()';
      orderDir = '';
    } else if (allowedColumns.includes(queryParams.sort_by) || queryParams.sort_by.includes('.')) {
      // Allow sorting by valid columns or JSON paths if the base column is allowed
      const parts = queryParams.sort_by.split('.');
      if (parts.length === 1 && allowedColumns.includes(parts[0])) {
        orderBy = tableAlias ? `${tableAlias}.${parts[0]}` : parts[0];
      } else if (parts.length > 1 && allowedColumns.includes(parts[0])) {
         // Handle JSON sort: json_extract(col, '$.path')
         const col = tableAlias ? `${tableAlias}.${parts[0]}` : parts[0];
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
    let sqlField = '';
    const parts = field.split('.');
    if (allowedColumns.includes(field)) {
      sqlField = tableAlias ? `${tableAlias}.${field}` : field;
    } else if (parts.length > 1 && allowedColumns.includes(parts[0])) {
      // JSON extraction
      const col = tableAlias ? `${tableAlias}.${parts[0]}` : parts[0];
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

    whereClauses.push(`${sqlField} ${sqlOp} ?`);
    whereParams.push(paramValue);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
  const orderSql = orderBy === 'RANDOM()' ? 'ORDER BY RANDOM()' : `ORDER BY ${orderBy} ${orderDir}`;

  const sql = `SELECT * FROM ${tableName} ${whereSql} ${orderSql} LIMIT ? OFFSET ?`;
  const params = [...whereParams, limit, offset];

  return { sql, params, whereSql, orderSql, limit, offset, whereParams };
}
