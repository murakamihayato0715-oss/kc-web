/* eslint-disable */
// コピペ方式プロンプトのプレビュー用スクリプト。
// API通信は行わない。promptBuilder が実際にどんなテキストを組み立てるかを
// ターミナルで確認するための開発用ツール（`npm run preview-prompt`）。
import { buildAiPrompt } from './ai/promptBuilder';
import { ChatMessage } from './ai/types';

function previewPrompt() {
  const dummyUserRequest = '5-5海域向けの装備をアセンブルしてください。';
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

  const dummyKnowledgeContext = '【海域情報】5-5ボスには強力な空母レ級などが配備されています。';

  const chatHistory: ChatMessage[] = [{ role: 'user', message: dummyUserRequest }];

  const prompt = buildAiPrompt(chatHistory, {
    mode: 'fleet',
    fleetContext: dummyFleetContext,
    knowledgeContext: dummyKnowledgeContext,
  });

  console.log('==================================================');
  console.log('【提督がコピーしてチャットAIに貼り付けるプロンプトのプレビュー】');
  console.log('==================================================');
  console.log(prompt);
  console.log('==================================================');
  console.log(`文字数: ${prompt.length}`);
}

previewPrompt();
