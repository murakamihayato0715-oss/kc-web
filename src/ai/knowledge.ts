/* eslint-disable */

/** 入力テキストから関連する一般ナレッジファイルを特定 */
function detectArea(request: string): string[] {
  const files: string[] = [];

  // キーワードで追加ファイルを検出
  if (request.includes('基地') || request.includes('陸攻')) {
    files.push('基地航空隊.md');
  }
  if (request.includes('支援')) {
    files.push('支援艦隊.md');
  }
  if (request.includes('連合') || request.includes('機動') || request.includes('水上')) {
    files.push('連合艦隊.md');
  }
  if (request.includes('ルート') || request.includes('分岐')) {
    files.push('ルート分岐.md');
  }

  // 追加されたナレッジファイルへのマッピング
  if (
    request.includes('戦闘') ||
    request.includes('夜戦') ||
    request.includes('カットイン') ||
    request.includes('連撃') ||
    request.includes('特殊攻撃') ||
    request.includes('タッチ') ||
    request.includes('弾着')
  ) {
    files.push('戦闘について.md');
  }
  if (request.includes('増設') || request.includes('補強')) {
    files.push('補強増設.md');
  }
  if (request.includes('改修') || request.includes('★') || request.includes('強化')) {
    files.push('改修工廠.md');
  }
  if (request.includes('疲労') || request.includes('キラ') || request.includes('コンディション')) {
    files.push('疲労度.md');
  }
  if (
    request.includes('資材') ||
    request.includes('資源') ||
    request.includes('燃料') ||
    request.includes('弾薬') ||
    request.includes('鋼材') ||
    request.includes('ボーキ') ||
    request.includes('バケツ')
  ) {
    files.push('資材.md');
  }
  if (request.includes('ケッコン') || request.includes('結婚') || request.includes('カッコカリ') || request.includes('レベル上限')) {
    files.push('ケッコンカッコカリ.md');
  }
  if (request.includes('使い方') || request.includes('シミュレータ') || request.includes('neco') || request.includes('ネコ')) {
    files.push('【艦これ】これだけ見れば全部わかる！_制空権シミュレータの使い方_初級編_-_necoのゲーム散歩.md');
  }

  return [...new Set(files)];
}

/** mapsフォルダから直接海域ファイルをロード、または一般ファイルをフェッチする */
async function loadKnowledgeFile(filename: string, request: string): Promise<string> {
  try {
    // リクエストから特定の海域番号（例: "5-4"）を抽出してマップ直読みを試みる
    const mapMatch = request.match(/([1-7]-[1-7])/);
    if (mapMatch) {
      const mapName = mapMatch[1];
      try {
        const mapRes = await fetch(`/knowledge/maps/${mapName}.md`);
        if (mapRes.ok) {
          const mapText = await mapRes.text();
          return `【${mapName}詳細情報 (※敵のHP・装甲値・制空値に注目して、火力キャップ・確定中破ラインを意識した装備を提案してください)】\n${mapText}`;
        }
      } catch (e) {
        console.warn(`Failed to fetch partitioned map file /knowledge/maps/${mapName}.md`, e);
      }
    }

    // 通常のファイルフェッチ
    if (!filename) return '';
    const res = await fetch(`/knowledge/${filename}`);
    if (!res.ok) return '';
    const text = await res.text();
    return text.slice(0, 10000);
  } catch {
    return '';
  }
}

/** リクエストに関連するwiki知識を返す */
export async function buildKnowledgeContext(request: string): Promise<string> {
  const files = detectArea(request);
  const allFiles = ['装備編成の基本ルール.md', ...files];

  const contents = await Promise.all(allFiles.map((file) => loadKnowledgeFile(file, request)));
  const combined = contents.filter(Boolean).join('\n\n---\n\n');
  if (!combined) return '';

  return `【攻略Wiki情報】\n${combined}`;
}
