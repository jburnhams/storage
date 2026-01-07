export interface SearchResult {
  sql: string;
  params: any[];
}

export interface QueryComponents {
  whereSql: string;
  orderSql: string;
  limit: number;
  offset: number;
  params: any[];
}

export function buildQueryComponents(
  queryParams: Record<string, string>,
  allowedColumns: string[]
): QueryComponents {
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
      orderDir = '';
    } else if (allowedColumns.includes(queryParams.sort_by) || queryParams.sort_by.includes('.')) {
      const parts = queryParams.sort_by.split('.');
      if (allowedColumns.includes(queryParams.sort_by)) {
        orderBy = queryParams.sort_by;
      } else if (parts.length === 1 && allowedColumns.includes(parts[0])) {
        orderBy = parts[0];
      } else if (parts.length > 1 && allowedColumns.includes(parts[0])) {
         const col = parts[0];
         const path = parts.slice(1).join('.');
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

    let field = key;
    let op = 'eq';

    for (const validOp of validOps) {
      if (key.endsWith(`_${validOp}`)) {
        op = validOp;
        field = key.slice(0, -1 * (validOp.length + 1));
        break;
      }
    }

    let sqlField = '';
    const parts = field.split('.');
    if (allowedColumns.includes(field)) {
      sqlField = field;
    } else if (parts.length > 1 && allowedColumns.includes(parts[0])) {
      const col = parts[0];
      const path = parts.slice(1).join('.');
      if (/^[a-zA-Z0-9_.]+$/.test(path)) {
        sqlField = `json_extract(${col}, '$.${path}')`;
      } else {
        continue;
      }
    } else {
      continue;
    }

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
    params.push(paramValue);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
  const orderSql = orderBy === 'RANDOM()' ? 'ORDER BY RANDOM()' : `ORDER BY ${orderBy} ${orderDir}`;

  return { whereSql, orderSql, limit, offset, params };
}

export function buildSqlSearch(
  tableName: string,
  queryParams: Record<string, string>,
  allowedColumns: string[]
): SearchResult {
  const { whereSql, orderSql, limit, offset, params } = buildQueryComponents(queryParams, allowedColumns);
  const sql = `SELECT * FROM ${tableName} ${whereSql} ${orderSql} LIMIT ? OFFSET ?`;
  return { sql, params: [...params, limit, offset] };
}
