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

  const resolveField = (fieldStr: string): string | null => {
    // Exact match
    if (allowedColumns.includes(fieldStr)) {
      return fieldStr;
    }
    // Check for JSON path
    // Try splitting by dot.
    // If fieldStr is "v.statistics.viewCount"
    // allowedColumns has "v.statistics"
    // We want to match "v.statistics" and extract "viewCount".

    // We iterate allowedColumns to see if fieldStr starts with one of them + dot
    for (const allowed of allowedColumns) {
      if (fieldStr === allowed) return allowed;
      if (fieldStr.startsWith(allowed + '.')) {
         const path = fieldStr.substring(allowed.length + 1);
         if (/^[a-zA-Z0-9_.]+$/.test(path)) {
            return `json_extract(${allowed}, '$.${path}')`;
         }
      }
    }

    // Fallback legacy logic: split by first dot if allowedColumns contains simple names
    const parts = fieldStr.split('.');
    if (parts.length > 1 && allowedColumns.includes(parts[0])) {
         const col = parts[0];
         const path = parts.slice(1).join('.');
         if (/^[a-zA-Z0-9_.]+$/.test(path)) {
            return `json_extract(${col}, '$.${path}')`;
         }
    }

    return null;
  };

  if (queryParams.sort_by) {
    if (queryParams.sort_by === 'random') {
      orderBy = 'RANDOM()';
      orderDir = '';
    } else {
       const resolved = resolveField(queryParams.sort_by);
       if (resolved) {
         orderBy = resolved;
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

    const sqlField = resolveField(field);
    if (!sqlField) continue;

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
