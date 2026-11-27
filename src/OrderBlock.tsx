// react-maker が管理するファイルです。書き出し・再生成で上書きされます。変更は src/integrations/ に書いてください（react-maker/manifest.json）。
import React, { useEffect, useRef, type MouseEvent } from 'react';
import { StatusMessage } from './StatusMessage.tsx';
import { ScreenImage } from './ScreenImage.tsx';
import { MAX_QUANTITY, yen } from './order.ts';
import type { OrderBlockProps, OrderLine } from './order-types.ts';
import type { DataField, ProductData } from './model-types.ts';

function OrderTotal({ count, total }: { count: number; total: number }) {
  return <p className="order-total"><span>合計（{count}点）</span><strong>{yen(total)}</strong></p>;
}

function ProductDetails({ product, fields }: { product: ProductData; fields: DataField[] }) {
  const details = fields.filter(({ id, visible }) => {
    const value = product.values?.[id];
    return visible && value != null && value !== '';
  });
  if (!details.length) return null;
  return <dl className="product-details">
    {details.map(({ id, label, type }) => {
      const value = product.values?.[id];
      return <div key={id}><dt>{label}</dt><dd>{type === 'boolean' ? (value ? 'はい' : 'いいえ')
        : Array.isArray(value) ? value.join('、') : value}</dd></div>;
    })}
  </dl>;
}


export function OrderBlock({ type, order, editing, productFields, onProductAdded, settings }: OrderBlockProps) {
  const cartBlock = useRef<HTMLUListElement>(null);
  const emptyMessage = useRef<HTMLParagraphElement>(null);
  const focusAfterRemoval = useRef(false);
  useEffect(() => {
    if (!focusAfterRemoval.current) return;
    focusAfterRemoval.current = false;
    (cartBlock.current?.querySelector<HTMLButtonElement>('button') ?? emptyMessage.current)?.focus();
  }, [order.summary.count]);

  function updateCart(event: MouseEvent<HTMLButtonElement>, line: OrderLine, quantity: number) {
    if (editing) return;
    if (quantity === 0 && event.currentTarget === event.currentTarget.ownerDocument.activeElement) {
      focusAfterRemoval.current = true;
    }
    order.setQuantity(line.id, quantity);
  }

  if (type === 'catalog') {
    if (order.catalog.loading) return <StatusMessage state="loading" settings={settings} fallback="商品を読み込み中…" />;
    if (order.catalog.error) return <StatusMessage state="error" settings={settings} fallback={order.catalog.error}
      onRetry={editing ? undefined : order.retryCatalog} />;
    if (!order.catalog.products.length) return <StatusMessage state="empty" settings={settings} fallback="商品がありません。" />;
    return <>
      <ul className="order-list">
        {order.catalog.products.map((product) => {
          const quantity = order.summary.lines.find((line) => line.id === product.id)?.quantity ?? 0;
          return <li className="product-card" key={product.id}>
            {product.image && <ScreenImage key={product.image} src={product.image} />}
            <h2>{product.name}</h2>
            <strong>{yen(product.price)}</strong>
            <ProductDetails product={product} fields={productFields} />
            <button type="button" aria-label={`${product.name}をカートに追加`} disabled={!editing && (order.pending || order.orderOutcomeUnknown || quantity >= MAX_QUANTITY)}
              onClick={() => {
                if (editing) return;
                order.setQuantity(product.id, quantity + 1);
                onProductAdded();
              }}>カートに追加</button>
          </li>;
        })}
      </ul>
      <div role="status"><OrderTotal {...order.summary} /></div>
    </>;
  }
  if (type === 'receipt') {
    return order.receipt
      ? <div role="status"><p>模擬注文が完了しました。</p><p>注文番号 {order.receipt.id}</p><p>合計 {yen(order.receipt.total)}</p></div>
      : <StatusMessage state="empty" settings={settings} fallback="注文結果がここに表示されます。" />;
  }

  const cart = type === 'cart';
  const summary = cart ? order.summary : order.quote;
  if (!summary?.count) return <StatusMessage state="empty" settings={settings} focusable={cart} messageRef={cart ? emptyMessage : undefined}
    fallback={cart ? 'カートは空です。' : '注文内容がここに表示されます。'} />;
  return <>
    <ul className="order-list" ref={cart ? cartBlock : undefined}>
      {summary.lines.map((line) => <li className="cart-line" key={line.id}>
        <strong>{line.name}</strong>
        <p>単価 {yen(line.price)} × {line.quantity}点</p>
        <p>小計 {yen(line.price * line.quantity)}</p>
        {cart && <div className="quantity-controls">
          <button type="button" aria-label={`${line.name}の数量を減らす`} disabled={order.pending || order.orderOutcomeUnknown}
            onClick={(event) => updateCart(event, line, line.quantity - 1)}>−</button>
          <button type="button" aria-label={`${line.name}の数量を増やす`} disabled={order.pending || order.orderOutcomeUnknown || line.quantity >= MAX_QUANTITY}
            onClick={(event) => updateCart(event, line, line.quantity + 1)}>＋</button>
          <button type="button" aria-label={`${line.name}を削除`} disabled={order.pending || order.orderOutcomeUnknown}
            onClick={(event) => updateCart(event, line, 0)}>削除</button>
        </div>}
      </li>)}
    </ul>
    <div role="status"><OrderTotal {...summary} /></div>
  </>;
}
