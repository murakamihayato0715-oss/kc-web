/* eslint-disable */

/** 入力テキストから関連する海域ファイルを特定 */
function detectArea(request: string): string[] {
  const files: string[] = [];

  // 海域番号を検出
  const areaMap: Record<string, string> = {
    '1-': '01_鎮守府海域.md',
    '2-': '02_南西諸島海域.md',
    '3-': '03_北方海域.md',
    '4-': '04_西方海域.md',
    '5-': '07_南方海域.md', // 修正: 5-は南方海域
    '6-': '06_中部海域.md',
    '7-': '05_南西海域.md', // 修正: 7-は南西海域
  };

  for (const [key, file] of Object.entries(areaMap)) {
    if (request.includes(key)) {
      files.push(file);
      break;
    }
  }

  // キーワードで追加ファイルを検出
  if (request.includes('基地') || request.includes('陸攻')) {
    files.push('11_基地航空隊.md');
  }
  if (request.includes('支援')) {
    files.push('08_支援艦隊.md'); // 修正: 支援は08_支援艦隊.md
  }
  if (request.includes('連合') || request.includes('機動') || request.includes('水上')) {
    files.push('12_連合艦隊.md');
  }
  if (request.includes('ルート') || request.includes('分岐')) {
    files.push('09_ルート分岐.md');
  }

  return [...new Set(files)];
}

/** knowledgeフォルダのファイルをfetchで読み込み、必要部分を抽出する */
async function loadKnowledgeFile(filename: string, request: string): Promise<string> {
  try {
    // リクエストから特定の海域番号（例: "5-4"）を抽出して部分抽出を試みる
    const mapMatch = request.match(/([1-7]-[1-7])/);
    if (mapMatch) {
      const mapName = mapMatch[1];
      // 読み込んだファイルが該当海域のものか判定
      const isTargetArea = 
        (mapName.startsWith('1-') && filename.startsWith('01')) ||
        (mapName.startsWith('2-') && filename.startsWith('02')) ||
        (mapName.startsWith('3-') && filename.startsWith('03')) ||
        (mapName.startsWith('4-') && filename.startsWith('04')) ||
        (mapName.startsWith('5-') && filename.startsWith('07')) ||
        (mapName.startsWith('6-') && filename.startsWith('06')) ||
        (mapName.startsWith('7-') && filename.startsWith('05'));

      if (isTargetArea) {
        // まず細分化された海域別ファイルのロードを試みる
        try {
          const mapRes = await fetch(`/knowledge/maps/${mapName}.md`);
          if (mapRes.ok) {
            const mapText = await mapRes.text();
            return `【${mapName}詳細情報 (※敵のHP・装甲値・制空値に注目して、火力キャップ・確定中破ラインを意識した装備を提案してください)】\n${mapText}`;
          }
        } catch (e) {
          console.warn(`Failed to fetch partitioned map file /knowledge/maps/${mapName}.md, falling back...`, e);
        }

        // 見出し（例: "## 5-4" や "## 5-4.サーモン海域"）を検出（フォールバック）
        const res = await fetch(`/knowledge/${filename}`);
        if (!res.ok) return '';
        const text = await res.text();
        const regex = new RegExp(`^## (?:[^\\n]*?)${mapName.replace('-', '\\-')}\\b`, 'm');
        const match = text.match(regex);
        if (match && match.index !== undefined) {
          const startIdx = match.index;
          const nextHeadingRegex = /^##? /mg;
          nextHeadingRegex.lastIndex = startIdx + match[0].length;
          const nextHeadingMatch = nextHeadingRegex.exec(text);
          const endIdx = nextHeadingMatch ? nextHeadingMatch.index : text.length;

          const commonInfo = text.slice(0, 1500);
          const sectionContent = text.slice(startIdx, endIdx);
          return `【全体共通情報】\n${commonInfo}\n\n【${mapName}詳細情報 (※敵のHP・装甲値・制空値に注目して、火力キャップ・確定中破ラインを意識した装備を提案してください)】\n${sectionContent}`;
        }
      }
    }

    const res = await fetch(`/knowledge/${filename}`);
    if (!res.ok) return '';
    const text = await res.text();
    // 特定セクションが見つからない場合や補助情報の場合は、先頭5000文字を返す
    return text.slice(0, 5000);
  } catch {
    return '';
  }
}

/** リクエストに関連するwiki知識を返す */
export async function buildKnowledgeContext(request: string): Promise<string> {
  const files = detectArea(request);
  if (!files.length) return '';

  const contents = await Promise.all(files.map((file) => loadKnowledgeFile(file, request)));
  const combined = contents.filter(Boolean).join('\n\n---\n\n');
  if (!combined) return '';

  return `【攻略Wiki情報】\n${combined}`;
}
