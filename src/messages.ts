/*
 * ============================================================================
 *  Bot が発言・返信する文言はすべてこのファイルに入っています。
 *  文言を直したいときは、ここだけを編集してください。
 * ============================================================================
 *
 *  ■ 編集していい場所
 *    ダブルクオート " ... " で囲まれた日本語の部分だけを書き換えます。
 *      例)  ok: "本日の抽選に参加しました。",
 *                ^^^^^^^^^^^^^^^^^^^^^^ ここだけ直す
 *
 *  ■ さわってはいけないもの
 *    - 行頭の名前（ ok:  や  winner: など）とコロン
 *    - 行末のカンマ ,
 *    - { } で囲まれた記号（ {winner} {date} など）
 *      → Bot が実行時に「@ユーザー名」「2026-09-02」などへ差し替えます。
 *        文中で位置を動かすのは OK。消すと差し替えられなくなります。
 *    - \n は「改行」です。入れた場所で表示が改行されます。
 *
 *  ■ よくある壊し方（保存前に確認）
 *    - " の閉じ忘れ / 全角の ” を使ってしまう
 *    - 行末のカンマ , を消してしまう
 */

type Vars = Record<string, string | number>;

/** テンプレート中の {name} を vars の値へ差し替える。 */
export function fill(template: string, vars: Vars = {}): string {
    return template.replace(/\{(\w+)\}/g, (_, key: string) => {
        if (!(key in vars)) {
            throw new Error(`messages: プレースホルダ {${key}} に対応する値がありません`);
        }
        return String(vars[key]);
    });
}

export const messages = {
    /** 複数の場面で使い回す文言 */
    common: {
        error: "処理中にエラーが発生しました。",
        adminOnly: "このコマンドはサーバー管理権限を持つメンバー専用です。",
        unknownCommand: "未対応のコマンドです。",
        notSetup: "このサーバーはまだセットアップされていません。管理者に /setup の実行を依頼してください。",
        notSetupShort: "まだ /setup が実行されていません。",
    },

    /** 他サーバーから呼ばれたときの拒否メッセージ */
    guard: {
        wrongGuild: "このBotは指定されたサーバーでのみ利用できます。",
    },

    /** /entry の返信。抽選は前日に募るので「翌日の抽選」への登録になる。 */
    entry: {
        ok: "翌日の抽選に参加登録しました。",
        already: "既に翌日の抽選に参加登録しています。",
        alreadyAuto: "既に翌日の抽選に参加登録しています（自動参加が有効です）。",
    },

    /** /cancel の返信 */
    cancel: {
        ok: "翌日の抽選への参加登録を取り消しました。",
        okAuto: "翌日の抽選への参加登録を取り消しました。自動参加は有効なままです（停止するには /auto）。",
        notJoined: "翌日の抽選には参加登録していません。",
    },

    /** /auto の返信。{note} には下の *Note が入る場合がある（入らないと空になる）。 */
    auto: {
        on: "自動参加をオンにしました。解除するまで毎日、翌日の抽選に自動で参加します。",
        off: "自動参加をオフにしました。{note}",
        offAlsoNextNote: "翌日分の参加登録も取り消されました。",
    },

    /** /status の返信 */
    status: {
        body: "次回の抽選（{date}）\n\n参加状態: {joinState}\n自動参加: {autoState}",
        joined: "参加中",
        notJoined: "未参加",
        notJoinedCancelled: "未参加（翌日分は取り消し済み）",
        autoOn: "オン",
        autoOff: "オフ",
    },

    /** /setup の返信 */
    setup: {
        missingOptions: "draw_time / role / channel / work_channel をすべて指定してください。",
        invalidTime: "draw_time は HH:MM（24時間表記・日本時間）で指定してください。例: 20:00",
        saved:
            "セットアップを保存しました。\n" +
            "抽選時刻: {drawTime}（日本時間）\n" +
            "担当ロール: {role}\n" +
            "告知チャンネル: {channel}\n" +
            "制作チャンネル: {workChannel}",
    },

    /** /participants の返信。{list} には「1. @名前」の一覧が入る。 */
    participants: {
        empty: "{date} の参加者はまだいません。",
        list: "{date} の参加者（{count}名）\n\n{list}",
        autoSuffix: "（自動）",
    },

    /** /draw・/reroll コマンドを打った本人への返信 */
    draw: {
        error: "抽選処理でエラーが発生しました。ログを確認してください。",
        drawnReply: "抽選しました。担当者は {winner} さんです。",
        rerolledReply: "再抽選しました。新しい担当者は {winner} さんです。",
        alreadyDrawn: "本日は既に抽選済みです（担当者: {winner}）。やり直すなら /reroll を使用してください。",
        nothingToReroll: "本日はまだ抽選が行われていません。/draw を使用してください。",
        rerollNoCandidates: "他に対象となる参加者がいないため、担当は {winner} さんのままです。",
        noEntries: "参加者がいなかったため、本日の担当者はなしになりました。",
    },

    /** 告知チャンネルへ実際に投稿される文言 */
    announce: {
        winner: "本日のアンケート担当者は {winner} さんです。\n{workChannel} にてアンケートの作成をお願いします。",
        winnerReroll:
            "本日のアンケート担当者は {winner} さんです。（再抽選）\n{workChannel} にてアンケートの作成をお願いします。",
        // reroll 時、編集した告知に加えて新担当へ通知を飛ばすための短い追いメッセージ
        rerollFollowup: "再抽選しました。新しい担当者は {winner} さんです。",
        rerollCancelledNoEntries: "参加者がいなくなったため再抽選は取り消されました。本日の担当者はなしになりました。",
    },

    /**
     * スラッシュコマンド一覧に表示される説明文。
     * 変更後は `bun run register` を実行しないと Discord 側に反映されません。
     */
    commands: {
        entry: "翌日のアンケート担当抽選に参加登録する",
        auto: "自動参加のオン/オフを切り替える（解除するまで毎日参加）",
        cancel: "翌日の抽選への参加登録を取り消す",
        status: "自分の参加状態と自動参加の設定を確認する",
        setup: "Botのサーバー設定を行う（管理者用）",
        setupOptions: {
            draw_time: "抽選時刻 HH:MM（日本時間）",
            role: "アンケート担当ロール",
            channel: "抽選結果を告知するチャンネル",
            work_channel: "アンケートを制作するチャンネル",
        },
        draw: "本日の抽選を手動実行する（管理者用）",
        reroll: "本日の抽選をやり直す（管理者用）",
        participants: "次回の抽選の参加者一覧を表示する（管理者用）",
    },
} as const;
