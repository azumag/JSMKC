# Locale switch error fallback contract

`LocaleSwitcher` が `/api/locale` への切り替え要求に失敗した場合、ユーザー向け error toast は next-intl の `common.networkError` を使用する。

## 理由

locale 切り替えに失敗した時点では、画面で有効な locale は切り替え前のままである。したがって、失敗通知だけを切り替え先の言語で先に表示すると、現在の UI 言語と error toast の言語が食い違う。

`useTranslations('common')` を現在の render locale で評価し、`common.networkError` を表示することで、失敗時も画面全体の言語を一貫させる。

## 維持する契約

- 成功時は従来どおり切り替え先 locale に応じた success toast を表示する。
- `/api/locale` の POST payload と cookie contract は変更しない。
- API failure / fetch rejection では `router.refresh()` を呼ばない。
- logger の diagnostic message はユーザー向け翻訳とは分離したまま維持する。

## 非対象

- success toast の next-intl 化
- switch の aria-label の next-intl 化
- locale cookie / API endpoint の仕様変更
