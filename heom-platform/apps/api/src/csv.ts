export type InventoryCsvRow = {
  rowNumber: number;
  assetNumber: string;
  officialPropertyNumber: string | null;
  name: string;
  category: string;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  department: string | null;
  room: string | null;
  operationalStatus: 'EM_OPERACAO' | 'INDISPONIVEL' | 'EM_MANUTENCAO' | 'BAIXADO';
  criticality: 'BAIXA' | 'MEDIA' | 'ALTA' | 'CRITICA';
  errors: string[];
};

function normalizeHeader(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('pt-BR').replace(/[^a-z0-9]+/g, '');
}

function detectDelimiter(line: string): string {
  const candidates = [';', ',', '\t'];
  return candidates.map((delimiter) => ({ delimiter, count: line.split(delimiter).length - 1 }))
    .sort((a, b) => b.count - a.count)[0]?.delimiter || ';';
}

function parseRows(input: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const source = input.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (let index = 0; index < source.length; index++) {
    const char = source[index]!;
    if (char === '"') {
      if (quoted && source[index + 1] === '"') { field += '"'; index++; }
      else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(field); field = '';
    } else if (char === '\n' && !quoted) {
      row.push(field); field = '';
      if (row.some((value) => value.trim() !== '')) rows.push(row);
      row = [];
    } else field += char;
  }
  if (quoted) throw new Error('O CSV contém aspas sem fechamento. Revise o arquivo e tente novamente.');
  row.push(field);
  if (row.some((value) => value.trim() !== '')) rows.push(row);
  return rows;
}

const aliases: Record<string, string[]> = {
  assetNumber: ['patrimonio', 'numeropatrimonio', 'assetnumber', 'identificacao', 'identificador'],
  officialPropertyNumber: ['patrimoniooficial', 'numerooficial', 'tombamento', 'officialpropertynumber'],
  name: ['nome', 'equipamento', 'nomeequipamento', 'name'],
  category: ['categoria', 'tipo', 'tipodeequipamento', 'category'],
  manufacturer: ['fabricante', 'marca', 'manufacturer', 'brand'],
  model: ['modelo', 'model'],
  serialNumber: ['numerodeserie', 'serie', 'serial', 'serialnumber'],
  department: ['setor', 'departamento', 'department'],
  room: ['sala', 'ambiente', 'local', 'room'],
  operationalStatus: ['situacao', 'status', 'situacaooperacional', 'operationalstatus'],
  criticality: ['criticidade', 'criticality']
};

export function parseInventoryCsv(input: string): InventoryCsvRow[] {
  if (Buffer.byteLength(input, 'utf8') > 10 * 1024 * 1024) throw new Error('O arquivo CSV excede o limite de 10 MB.');
  const firstLine = input.replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0] || '';
  const rows = parseRows(input, detectDelimiter(firstLine));
  if (rows.length < 2) throw new Error('O CSV precisa conter cabeçalho e pelo menos uma linha de equipamento.');
  const headers = rows[0]!.map(normalizeHeader);
  const indexByField = new Map<string, number>();
  for (const [field, names] of Object.entries(aliases)) {
    const index = headers.findIndex((header) => names.includes(header));
    if (index >= 0) indexByField.set(field, index);
  }
  for (const required of ['assetNumber', 'name', 'category']) {
    if (!indexByField.has(required)) throw new Error(`Coluna obrigatória ausente no CSV: ${required === 'assetNumber' ? 'Patrimônio' : required === 'name' ? 'Nome' : 'Categoria'}.`);
  }
  const read = (cells: string[], field: string) => {
    const position = indexByField.get(field);
    return position === undefined ? '' : String(cells[position] ?? '').trim();
  };
  return rows.slice(1).map((cells, index): InventoryCsvRow => {
    const assetNumber = read(cells, 'assetNumber');
    const name = read(cells, 'name');
    const category = read(cells, 'category');
    const statusRaw = normalizeHeader(read(cells, 'operationalStatus'));
    const criticalityRaw = normalizeHeader(read(cells, 'criticality'));
    const statusMap: Record<string, InventoryCsvRow['operationalStatus']> = {
      emoperacao: 'EM_OPERACAO', operacional: 'EM_OPERACAO', indisponivel: 'INDISPONIVEL',
      emmanutencao: 'EM_MANUTENCAO', baixado: 'BAIXADO'
    };
    const criticalityMap: Record<string, InventoryCsvRow['criticality']> = {
      baixa: 'BAIXA', media: 'MEDIA', alta: 'ALTA', critica: 'CRITICA'
    };
    const errors: string[] = [];
    if (!assetNumber) errors.push('Patrimônio não informado.');
    if (assetNumber.length > 80) errors.push('Patrimônio excede 80 caracteres.');
    if (name.length < 2 || name.length > 180) errors.push('Nome deve conter entre 2 e 180 caracteres.');
    if (category.length < 2 || category.length > 100) errors.push('Categoria deve conter entre 2 e 100 caracteres.');
    if (statusRaw && !statusMap[statusRaw]) errors.push('Situação operacional inválida.');
    if (criticalityRaw && !criticalityMap[criticalityRaw]) errors.push('Criticidade inválida.');
    return {
      rowNumber: index + 2, assetNumber,
      officialPropertyNumber: read(cells, 'officialPropertyNumber') || null,
      name, category, manufacturer: read(cells, 'manufacturer') || null,
      model: read(cells, 'model') || null, serialNumber: read(cells, 'serialNumber') || null,
      department: read(cells, 'department') || null, room: read(cells, 'room') || null,
      operationalStatus: statusMap[statusRaw] || 'EM_OPERACAO', criticality: criticalityMap[criticalityRaw] || 'MEDIA', errors
    };
  });
}

export function findCsvDuplicates(rows: InventoryCsvRow[]): Map<number, string[]> {
  const seenAsset = new Map<string, number>();
  const seenSerial = new Map<string, number>();
  const seenProperty = new Map<string, number>();
  const duplicates = new Map<number, string[]>();
  for (const row of rows) {
    const issues: string[] = [];
    const assetKey = row.assetNumber.trim().toLocaleUpperCase('pt-BR');
    if (assetKey && seenAsset.has(assetKey)) issues.push(`Patrimônio repetido na linha ${seenAsset.get(assetKey)}.`);
    else if (assetKey) seenAsset.set(assetKey, row.rowNumber);
    const propertyKey = row.officialPropertyNumber?.trim().toLocaleUpperCase('pt-BR') || '';
    if (propertyKey && seenProperty.has(propertyKey)) issues.push(`Patrimônio oficial repetido na linha ${seenProperty.get(propertyKey)}.`);
    else if (propertyKey) seenProperty.set(propertyKey, row.rowNumber);
    const serialKey = row.serialNumber?.trim().toLocaleUpperCase('pt-BR') || '';
    if (serialKey && seenSerial.has(serialKey)) issues.push(`Número de série repetido na linha ${seenSerial.get(serialKey)}.`);
    else if (serialKey) seenSerial.set(serialKey, row.rowNumber);
    if (issues.length) duplicates.set(row.rowNumber, issues);
  }
  return duplicates;
}
