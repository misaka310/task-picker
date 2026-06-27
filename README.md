# 今日の一択メモ / task-picker

タスクを追加して、未完了タスクからランダムに1件を決めるシンプルなメモアプリです。
未ログインでもブラウザ内に保存でき、必要な場合だけGoogleログインでFirebaseへ同期できます。

## Demo

https://task-picker.onrender.com/

## 主な機能

- タスクの追加、編集、完了、削除
- 未完了タスクからランダムに1件を選択
- 未ログイン時は `localStorage` に保存
- Googleログイン後は Firebase Authentication + Firestore に同期
- ログイン時、端末内のローカルデータをFirestoreへ統合

## 起動

```bash
npm run dev
```

ブラウザで `http://localhost:3000` を開きます。

## Firebase設定

初期状態では `firebase-config.js` が `null` なので、ローカル保存のみで動きます。
GitHubにはFirebase実値を書かず、`firebase-config.js` は `export const firebaseConfig = null;` のまま維持します。

RenderでFirebase同期を使う場合は、RenderのEnvironmentに以下を設定します。6つすべてが設定されている場合だけ、サーバーが `/firebase-config.js` でFirebase Web configを生成して返します。1つでも不足している場合は `export const firebaseConfig = null;` を返します。

- `PUBLIC_FIREBASE_API_KEY`
- `PUBLIC_FIREBASE_AUTH_DOMAIN`
- `PUBLIC_FIREBASE_PROJECT_ID`
- `PUBLIC_FIREBASE_STORAGE_BUCKET`
- `PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `PUBLIC_FIREBASE_APP_ID`

Firebase Console 側で以下を有効化します。

1. Authentication > Sign-in method > Google
2. Firestore Database

## Firestore Security Rules 例

```txt
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/items/{itemId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

## 動作確認

- `npm run dev` で `http://localhost:3000` が開けること
- 未ログイン状態で追加・決定・完了・編集・削除ができること
- リロード後もローカル保存データが残ること
- Render環境変数設定後、Googleログインできること
- 別ブラウザやスマホ相当の画面でFirestore同期されること
- ログイン前のローカルデータがログイン後にFirestoreへ統合されること

## ライセンス

MIT License
