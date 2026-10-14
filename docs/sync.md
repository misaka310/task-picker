# 同期仕様

Googleログイン後は、ブラウザ内のローカルデータとFirestoreのデータを統合します。同期の正本は`sync-core.js`です。

## 競合解決

同じIDのタスクは`deletedAt ?? updatedAt`を比較し、新しい状態を採用します。

- 新しい編集は古い編集を上書き
- 新しい削除はtombstoneとして保持し、別端末の古いコピーによる復活を防止
- 削除より新しい編集がある場合、その編集を保持
- 更新時刻が完全に同じ場合は削除を優先
- Firestore TimestampとISO文字列を同じ形式へ正規化

削除済み項目は画面に表示しませんが、端末間の収束に必要なため同期データには残します。tombstoneを整理する場合は、全端末が削除を観測したと判断できるサーバー側ポリシーが必要です。

## Firebaseを使わない場合

`firebase-client-settings.js`が`export const firebaseConfig = null;`の場合はGoogleログインを表示せず、すべてのデータを`localStorage`だけへ保存します。
