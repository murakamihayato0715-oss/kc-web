/* eslint-disable */
import { suggestFleet } from './ai/client';
import { AiConfig } from './ai/types';

async function testLocalAi() {
  const config: AiConfig = {
    provider: 'gemini',
    apiKey: 'local-dummy',
    model: 'qwen3.5:9b'
  };

  console.log(`[KC-TEST] ローカルOllama（モデル: ${config.model}）への疎通テストを開始します...`);

  const dummyUserRequest = "5-5海域向けの装備をアセンブルしてください。";
  const dummyFleetContext = `
【所持装備一覧】
·51cm連装砲★+10 x 2
·41cm連装砲改二★+6 x 2
·九一式徹甲弾★+10 x 2
·三式水中探信儀★+10 x 4
·二式水戦改★+4 x 2

【手持ち艦娘】
・大和改二重(戦艦) Lv99 [補強増設あり]
・武蔵改二(戦艦) Lv99 [補強増設あり]
・タシュケント改(駆逐艦) Lv95
  `.trim();

  const dummyKnowledgeContext = "【海域情報】5-5ボスには強力な空母レ級などが配備されています。";

  try {
    const startTime = Date.now();
    
    // client.ts の suggestFleet をキック
    // ※生出力を確認するため、内部エラーが起きても catch できるようにします
    const result = await suggestFleet(config, dummyUserRequest, dummyFleetContext, dummyKnowledgeContext);
    
    const endTime = Date.now();
    console.log(`\n[KC-TEST] ➔ AIからの応答フェーズ終了（計算時間: ${((endTime - startTime) / 1000).toFixed(2)}秒）`);
    
    if (result) {
      console.log("==================================================");
      console.log("【生成されたアセンブルJSON結果】");
      console.log(JSON.stringify(result, null, 2));
      console.log("==================================================");
      console.log("➔ 疎通テストは【正常完了】です。");
    } else {
      console.log("❌ AIからの戻り値が null でした。client.ts 側のエラーログを確認してください。");
    }

  } catch (error) {
    console.error("❌ 致命的例外が発生しました:", error);
  }
}

testLocalAi();