// react-maker が生成した画面「LP」（/）。Issue #106
// コードで直してよい：クラス・属性（aria-*・data-*・id・title・role・lang）・文言・要素の前のコメントは、編集GUIに戻ります（docs/code-roundtrip.md）。
// それ以外の書き方（map・条件・フックなど）を使うと、このファイルは「コードで管理」になり、ツールは書き換えません。element('<id>') の要素は、共通の描画（ScreenView）が描きます。
import type { ScreenParts } from './types';

/** 画面の内容の署名。書き出したあとに project.json を直接書き換えると合わなくなり、そのあいだは共通の描画で表示する */
export const signature = "90lb8q";

export default function LpPage({ element }: ScreenParts) {
  return (
    <>
      {element("474f9be5-002c-410e-96bc-4c7497d0bdbf")} {/* 共通部品 */}
      {/* ヒーロー */}
      <div className="element element-container flex flex-col gap-space-s pl-space-ml pr-space-ml rounded-none pt-section pb-section bg-surface" data-element-id="d8bd4d7c-950a-445b-b16d-cbf574aa0062">
        {/* 内容の幅 */}
        <div className="element element-container flex flex-col gap-space-l w-full max-w-270 ml-auto mr-auto shrink-0" data-element-id="41e19405-c00e-475a-bce7-6f3336026371">
          {/* ヒーローの文 */}
          <div className="element element-container flex flex-col gap-space-m items-center text-center" data-element-id="30356261-bba4-4107-8367-d233b8b90126">
            <p className="element element-text m-0 font-bold tracking-[1px] text-muted" data-element-id="1e1792b5-52ab-4e6e-85ce-a06671cd4b65">{"新しいサービス"}</p>
            <h1 className="element element-heading m-0 text-text-2-75 leading-[1.2]" data-element-id="ae1fb015-6080-4abb-94cf-6d0ec5bf6c25">{"伝えたいことを、ひとことで。"}</h1>
            <p className="element element-text m-0 max-w-160 text-muted" data-element-id="6a46a972-0a6e-4e02-b48a-651be284ac2b">{"何ができて、誰の役に立つのかを、二行ほどで説明します。読んだ人が次に何をすればよいか分かるようにします。"}</p>
            {/* ボタンの並び */}
            <div className="element element-container flex flex-row gap-space-s flex-wrap items-center justify-center" data-element-id="e77fb24f-c397-423e-a68f-23588aa0007e">
              {element("0e263890-ab14-4074-abc9-549dbf47340e")} {/* ボタン */}
              {element("04fc88e6-3fb6-4c0e-a916-61be4f4495a5")} {/* ボタン */}
            </div>
          </div>
        </div>
      </div>
      {/* 特徴 */}
      <div className="element element-container flex flex-col gap-space-s pl-space-ml pr-space-ml rounded-none pt-section pb-section" data-element-id="1647223e-f291-41d6-b5d8-bf90123fc3f6">
        {/* 内容の幅 */}
        <div className="element element-container flex flex-col gap-space-l w-full max-w-270 ml-auto mr-auto shrink-0" data-element-id="4b180227-6738-4d3d-9361-efd891b220c7">
          <h2 className="element element-heading m-0" data-element-id="937610cf-04aa-478c-93f4-73192878078a">{"選ばれる理由"}</h2>
          {/* カードの並び */}
          <div className="element element-container grid-cols-[repeat(auto-fit,_minmax(min(240px,_100%),_1fr))] grid flex-col gap-space-ml" data-element-id="d255335d-8e0c-4219-bbdd-387f1aa77e31">
            {/* カード */}
            <div className="element element-container flex flex-col gap-space-s p-space-l border border-solid border-line rounded-card [transition-property:color,_background-color,_border-color,_box-shadow,_opacity,_filter,_translate,_scale,_rotate] [transition-duration:150ms] [transition-timing-function:ease-out] hover:shadow-[0px_8px_24px_0px_#00000014]" data-element-id="db81064c-1830-410d-986e-1afd344471d2">
              {element("6f06c3e5-fb96-43c3-941e-795c03957f5e")} {/* アイコン */}
              <h3 className="element element-heading m-0 text-text-1-25" data-element-id="2e94a34c-80a8-488b-b75a-536996d92f6b">{"かんたん"}</h3>
              <p className="element element-text m-0 text-muted" data-element-id="c2296f70-6b00-47f6-912e-9e15465c2b34">{"この特徴で、利用者の何が楽になるのかを書きます。"}</p>
            </div>
            {/* カード */}
            <div className="element element-container flex flex-col gap-space-s p-space-l border border-solid border-line rounded-card [transition-property:color,_background-color,_border-color,_box-shadow,_opacity,_filter,_translate,_scale,_rotate] [transition-duration:150ms] [transition-timing-function:ease-out] hover:shadow-[0px_8px_24px_0px_#00000014]" data-element-id="633a34d4-88ef-4f77-a209-d066965df61e">
              {element("6e9975c4-0460-4c7d-b24e-e5ac1e3921fe")} {/* アイコン */}
              <h3 className="element element-heading m-0 text-text-1-25" data-element-id="06cfd87a-ef27-463c-a6ec-e3917ff97d4a">{"はやい"}</h3>
              <p className="element element-text m-0 text-muted" data-element-id="ccdd6fd0-8c44-49e1-9cfa-93f0846b628d">{"この特徴で、利用者の何が楽になるのかを書きます。"}</p>
            </div>
            {/* カード */}
            <div className="element element-container flex flex-col gap-space-s p-space-l border border-solid border-line rounded-card [transition-property:color,_background-color,_border-color,_box-shadow,_opacity,_filter,_translate,_scale,_rotate] [transition-duration:150ms] [transition-timing-function:ease-out] hover:shadow-[0px_8px_24px_0px_#00000014]" data-element-id="0e159e83-4d48-4d29-bc73-dcfc4da7b9fb">
              {element("a78359f6-5f3a-435f-ae52-14dffb756e81")} {/* アイコン */}
              <h3 className="element element-heading m-0 text-text-1-25" data-element-id="e6f39185-8711-4978-843a-9ba6588ea3ea">{"あんしん"}</h3>
              <p className="element element-text m-0 text-muted" data-element-id="cd8698ae-469e-4e80-a06f-9c7eebc7e5b4">{"この特徴で、利用者の何が楽になるのかを書きます。"}</p>
            </div>
          </div>
        </div>
      </div>
      {/* 数字 */}
      <div className="element element-container flex flex-col gap-space-s pl-space-ml pr-space-ml rounded-none pt-section pb-section bg-surface" data-element-id="2c218eb1-c492-4c53-ab94-ae825efda124">
        {/* 内容の幅 */}
        <div className="element element-container flex flex-col gap-space-l w-full max-w-270 ml-auto mr-auto shrink-0" data-element-id="508a96e9-07d8-41fe-8d68-a8d65f4778e0">
          {/* 数字の並び */}
          <div className="element element-container grid-cols-[repeat(auto-fit,_minmax(min(180px,_100%),_1fr))] grid flex-col gap-space-ml" data-element-id="74585018-b6fd-4138-adc7-aceb9f8aec70">
            {/* 数字 */}
            <div className="element element-container flex flex-col gap-space-xs items-center text-brand" data-element-id="59c1f94c-bd88-4342-a6f1-b00f4895dd23">
              <h3 className="element element-heading m-0 text-text-2-5" data-element-id="2ab25b13-c8f5-450b-af85-30c08e8569a9">{"1,200社"}</h3>
              <p className="element element-text m-0 text-muted" data-element-id="a8d633f7-7f72-4592-a5a0-2861b33b8c36">{"導入企業"}</p>
            </div>
            {/* 数字 */}
            <div className="element element-container flex flex-col gap-space-xs items-center text-brand" data-element-id="4b511539-50d2-4c47-8d57-ec697792daf1">
              <h3 className="element element-heading m-0 text-text-2-5" data-element-id="e015ee27-8f0f-4d7f-9808-dbe7b3ce797b">{"98%"}</h3>
              <p className="element element-text m-0 text-muted" data-element-id="99ab194b-92b2-4bcf-a72d-b021b4ac60f5">{"継続率"}</p>
            </div>
            {/* 数字 */}
            <div className="element element-container flex flex-col gap-space-xs items-center text-brand" data-element-id="7bb25f17-58fc-4a6a-b2a2-f051b6de3e1c">
              <h3 className="element element-heading m-0 text-text-2-5" data-element-id="4d0d6c59-3d03-483c-9382-6533ad24675a">{"24時間"}</h3>
              <p className="element element-text m-0 text-muted" data-element-id="38f28612-ed8a-49be-b62f-baa72dd454d9">{"サポート"}</p>
            </div>
          </div>
        </div>
      </div>
      {/* お客様の声 */}
      <div className="element element-container flex flex-col gap-space-s pl-space-ml pr-space-ml rounded-none pt-section pb-section" data-element-id="026cb3e1-2c93-4888-acff-8475ca848488">
        {/* 内容の幅 */}
        <div className="element element-container flex flex-col gap-space-l w-full max-w-270 ml-auto mr-auto shrink-0" data-element-id="2624da1b-8838-4be9-831c-eeeafe339b47">
          <h2 className="element element-heading m-0" data-element-id="ca99eda0-008d-4ee1-b2c6-9ed20b8a486f">{"お客様の声"}</h2>
          {/* カードの並び */}
          <div className="element element-container grid-cols-[repeat(auto-fit,_minmax(min(280px,_100%),_1fr))] grid flex-col gap-space-ml" data-element-id="a47ffa6f-4925-4f7e-8680-c0cb95578d66">
            {/* カード */}
            <div className="element element-container flex flex-col gap-space-s p-space-l border border-solid border-line rounded-card [transition-property:color,_background-color,_border-color,_box-shadow,_opacity,_filter,_translate,_scale,_rotate] [transition-duration:150ms] [transition-timing-function:ease-out] hover:shadow-[0px_8px_24px_0px_#00000014]" data-element-id="bed0f8f9-0792-4336-a4c7-1fb4e3d51c04">
              <p className="element element-text m-0 text-text-1-125 leading-[1.7]" data-element-id="655a5948-2c0b-4622-83b5-34f3b2369519">{"「作業時間が半分になりました。」"}</p>
              <p className="element element-text m-0 text-text-0-875 text-muted" data-element-id="cc6d9084-8365-4a36-92bf-295cdbc92663">{"株式会社サンプル　担当者 1"}</p>
            </div>
            {/* カード */}
            <div className="element element-container flex flex-col gap-space-s p-space-l border border-solid border-line rounded-card [transition-property:color,_background-color,_border-color,_box-shadow,_opacity,_filter,_translate,_scale,_rotate] [transition-duration:150ms] [transition-timing-function:ease-out] hover:shadow-[0px_8px_24px_0px_#00000014]" data-element-id="65963249-ab54-486f-8083-60c5e1bb1923">
              <p className="element element-text m-0 text-text-1-125 leading-[1.7]" data-element-id="505ada2a-44b6-4ad6-9fb0-b4db85a007a4">{"「チームの誰でも使えます。」"}</p>
              <p className="element element-text m-0 text-text-0-875 text-muted" data-element-id="bc8b4d58-76cf-43b5-8811-04ec304d3e42">{"株式会社サンプル　担当者 2"}</p>
            </div>
          </div>
        </div>
      </div>
      {/* 料金 */}
      <div className="element element-container flex flex-col gap-space-s pl-space-ml pr-space-ml rounded-none pt-section pb-section" data-element-id="cde0af38-5386-4142-94d3-f94400e0542a">
        {/* 内容の幅 */}
        <div className="element element-container flex flex-col gap-space-l w-full max-w-270 ml-auto mr-auto shrink-0" data-element-id="dc0e5272-3ee6-4af2-8d02-d545db9cc14b">
          <h2 className="element element-heading m-0" data-element-id="1d369285-4557-47c2-80a2-749baf62f5ac">{"料金"}</h2>
          {/* カードの並び */}
          <div className="element element-container grid-cols-[repeat(auto-fit,_minmax(min(240px,_100%),_1fr))] grid flex-col gap-space-ml" data-element-id="2748a7f5-e0da-4e3a-b105-a186ca59720e">
            {/* カード */}
            <div className="element element-container flex flex-col gap-space-s p-space-l border border-solid border-line rounded-card [transition-property:color,_background-color,_border-color,_box-shadow,_opacity,_filter,_translate,_scale,_rotate] [transition-duration:150ms] [transition-timing-function:ease-out] hover:shadow-[0px_8px_24px_0px_#00000014]" data-element-id="53223ce7-2e6a-410d-a360-c18d89615195">
              <h3 className="element element-heading m-0 text-text-1-125" data-element-id="c7e02c47-0f82-45e3-9c8d-ad3260219061">{"ライト"}</h3>
              <h4 className="element element-heading m-0 text-text-2" data-element-id="7413bd05-ea86-44a8-8852-9b0c53f40764">{"0円"}</h4>
              <p className="element element-text m-0 text-muted" data-element-id="3257cc4d-2e60-4e40-a7dd-9ad8476c1ddd">{"個人で試す"}</p>
              {element("fdedbf12-c075-41f9-9b4b-5116d1c16c88")} {/* ボタン */}
            </div>
            {/* カード */}
            <div className="element element-container flex flex-col gap-space-s p-space-l border-2 border-solid border-line rounded-card [transition-property:color,_background-color,_border-color,_box-shadow,_opacity,_filter,_translate,_scale,_rotate] [transition-duration:150ms] [transition-timing-function:ease-out] hover:shadow-[0px_8px_24px_0px_#00000014]" data-element-id="e954ed7b-b0e1-49aa-b1ee-a7dcece8c129">
              <h3 className="element element-heading m-0 text-text-1-125" data-element-id="9e5aeb71-1c57-4572-8d90-420b176a1c37">{"スタンダード"}</h3>
              <h4 className="element element-heading m-0 text-text-2" data-element-id="ca1034ff-c812-4813-a951-797a5487047d">{"2,980円"}</h4>
              <p className="element element-text m-0 text-muted" data-element-id="062b1a8d-ba25-463e-bacb-32fe2ac81fc8">{"チームで使う"}</p>
              {element("93f445f6-fcd8-4a77-b77b-fcbc4006c9d7")} {/* ボタン */}
            </div>
            {/* カード */}
            <div className="element element-container flex flex-col gap-space-s p-space-l border border-solid border-line rounded-card [transition-property:color,_background-color,_border-color,_box-shadow,_opacity,_filter,_translate,_scale,_rotate] [transition-duration:150ms] [transition-timing-function:ease-out] hover:shadow-[0px_8px_24px_0px_#00000014]" data-element-id="fea0c5b4-8125-46b6-afa6-78999bfa8434">
              <h3 className="element element-heading m-0 text-text-1-125" data-element-id="8da59e9d-9f29-4edb-9a91-2b6e0084339c">{"ビジネス"}</h3>
              <h4 className="element element-heading m-0 text-text-2" data-element-id="9ac1e983-68a2-4d1a-87cf-72af80d3fc43">{"要相談"}</h4>
              <p className="element element-text m-0 text-muted" data-element-id="a01e050e-d74d-4358-b354-571bac80ccd5">{"組織で使う"}</p>
              {element("957eb46f-7eb5-42c3-afa9-45ade072d333")} {/* ボタン */}
            </div>
          </div>
        </div>
      </div>
      {/* よくある質問 */}
      <div className="element element-container flex flex-col gap-space-s pl-space-ml pr-space-ml rounded-none pt-section pb-section" data-element-id="fcf2763d-c967-42fe-87cd-97a660d97285">
        {/* 内容の幅 */}
        <div className="element element-container flex flex-col gap-space-l w-full max-w-270 ml-auto mr-auto shrink-0" data-element-id="5a798aa7-ce90-432b-a0f2-6b320eec2db1">
          <h2 className="element element-heading m-0" data-element-id="37b68399-8faf-4748-afbd-f178a9483b07">{"よくある質問"}</h2>
          {/* 質問の一覧 */}
          <div className="element element-container flex flex-col gap-0" data-element-id="4a65f982-913e-409d-a192-ae8b443aa7ee">
            {element("7c43f34c-e0d7-440f-b334-c7dffea24553")} {/* 共通部品 */}
            {element("a4fe3ffd-2993-4003-8c2f-d8ddcdaa7290")} {/* 共通部品 */}
          </div>
        </div>
      </div>
      {/* 問い合わせ */}
      <div className="element element-container flex flex-col gap-space-s pl-space-ml pr-space-ml rounded-none pt-section pb-section bg-surface" data-element-id="9e299b0e-b4b6-4328-9e75-d6e8b25dfcf4">
        {/* 内容の幅 */}
        <div className="element element-container flex flex-col gap-space-l w-full max-w-270 ml-auto mr-auto shrink-0" data-element-id="127a04af-aaa0-4958-9620-dbbef566cc7a">
          <h2 className="element element-heading m-0" data-element-id="224be617-11d8-4583-8125-f717a91e4592">{"お問い合わせ"}</h2>
          <div className="element element-container flex flex-col gap-space-m max-w-140" data-element-id="fea9e2b8-ad23-4e23-833a-0b335e407393">
            {/* フォーム */}
            {element("593ae676-5a57-4830-ab8a-62144ee930cd")} {/* フォーム */}
          </div>
        </div>
      </div>
      {element("cc428c9c-25a7-4ad8-9678-e060fee9988a")} {/* 共通部品 */}
    </>
  );
}
