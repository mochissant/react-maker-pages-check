// react-maker が管理するファイルです。書き出し・再生成で上書きされます。変更は src/integrations/ に書いてください（react-maker/manifest.json）。
/**
 * データの取得と、画面への受け渡し（Issue #117）。react-maker が管理するファイルです。
 * useSiteDatasets：画面を開いたときに dataApi で一覧を取り、読み込み中・失敗・再試行を、画面の状態表示に渡す
 */
import { useEffect, useMemo, useState } from 'react';
import { dataApi } from './integrations/data-api';
import type { DatasetKey, ListQuery } from './integrations/data-api';
import { fromApi, mockDataApi, pattern } from './data-mock';
import type { ApiRecord, InternalRecord } from './data-mock';
import { datasetKeys } from './generated/data-types';
import type { SiteProject } from './site-types';

const keyOf = new Map(Object.entries(datasetKeys as unknown as Record<string, { id: string }>).map(([key, { id }]) => [id, key]));

type State = Record<string, { records?: InternalRecord[]; status: 'loading' | 'error' | 'ready' }>;

/** すべてのデータ一覧を取得して、画面に渡す形にする（1回に500件ずつ、最後のページまで） */
export function useSiteDatasets(site: SiteProject) {
  // モックのまま（本番のAPIもパターンも指定なし）なら、手元のダミーデータをそのまま使い、読み込み待ちを挟まない
  const local = dataApi === mockDataApi && !pattern;
  const [state, setState] = useState<State>(() => Object.fromEntries(site.datasets.map(({ id }) => [id, local ? { status: 'ready' as const } : { status: 'loading' as const }])));
  const [attempts, setAttempts] = useState<Record<string, number>>({});
  useEffect(() => {
    if (local && !Object.keys(attempts).length) return undefined;
    const controller = new AbortController();
    for (const dataset of site.datasets) {
      const key = keyOf.get(dataset.id) as DatasetKey | undefined;
      if (!key) continue;
      setState((current) => ({ ...current, [dataset.id]: { status: 'loading' } }));
      void (async () => {
        try {
          const records: InternalRecord[] = [];
          for (let page = 1; ; page += 1) {
            const query: ListQuery<typeof key> = { page, pageSize: 500 };
            const result = await dataApi.list(key, query, controller.signal);
            records.push(...(result.records as unknown as ApiRecord[]).map((record) => fromApi(key, record)));
            if (records.length >= result.total || !result.records.length) break;
          }
          setState((current) => ({ ...current, [dataset.id]: { status: 'ready', records } }));
        } catch (error) {
          if (!controller.signal.aborted) setState((current) => ({ ...current, [dataset.id]: { status: 'error' } }));
          void error;
        }
      })();
    }
    return () => controller.abort();
  }, [site, JSON.stringify(attempts)]); // eslint-disable-line react-hooks/exhaustive-deps
  return useMemo(() => ({
    datasets: site.datasets.map((dataset) => (state[dataset.id]?.records ? { ...dataset, records: state[dataset.id].records } : dataset)) as SiteProject['datasets'],
    scenarios: Object.fromEntries(Object.entries(state).filter(([, value]) => value.status !== 'ready').map(([id, value]) => [id, { kind: value.status }])),
    retry: (id: string) => setAttempts((current) => ({ ...current, [id]: (current[id] ?? 0) + 1 })),
  }), [site, state]);
}
