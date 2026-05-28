import { useState } from 'react';
import type { AiProviderConfig, TestConnectionResult } from '../services/api';
import {
  useUpsertAiConfigMutation,
  useDeleteAiConfigMutation,
  useTestAiConnectionMutation,
  useAiConfigsQuery,
  useSessionsQuery,
} from '../hooks/queries';
import './AiProviders.css';

function getLinkedSessionIds(configs: AiProviderConfig[] | undefined): Set<string> {
  if (!configs) return new Set();
  return new Set(configs.map((c) => c.sessionId));
}

export default function AiProviders() {
  const { data: configs, isLoading } = useAiConfigsQuery();
  const { data: sessions } = useSessionsQuery();
  const upsert = useUpsertAiConfigMutation();
  const remove = useDeleteAiConfigMutation();
  const testConn = useTestAiConnectionMutation();

  const [editing, setEditing] = useState<Partial<AiProviderConfig> & { sessionId?: string }>({});
  const [testResult, setTestResult] = useState<TestConnectionResult | null>(null);

  const linkedIds = getLinkedSessionIds(configs);

  const sessionOptions = (sessions ?? [])
    .filter((s) => !linkedIds.has(s.name) || s.name === editing.sessionId)
    .sort((a, b) => a.name.localeCompare(b.name));

  const handleNew = () => {
    setEditing({
      name: '',
      sessionId: '',
      baseUrl: '',
      apiKey: '',
      model: 'gpt-4o',
      enabled: true,
      timeoutMs: 30000,
    });
  };

  const handleEdit = (c: AiProviderConfig) => {
    setEditing({ ...c });
  };

  const canSave = !!(editing.sessionId && editing.name && editing.baseUrl && editing.apiKey);

  const handleDelete = async (sessionId: string) => {
    if (window.confirm('Remove AI config for session ' + sessionId + '?')) {
      await remove.mutateAsync(sessionId);
    }
  };

  const handleTest = async (sessionId: string) => {
    const result = await testConn.mutateAsync(sessionId);
    setTestResult(result);
  };

  const getSessionStatus = (sessionName: string): string | null => {
    const s = sessions?.find((x: { name: string; status: string }) => x.name === sessionName);
    return s?.status ?? null;
  };  const handleSave = async () => {
    if (!canSave) return;
    const { sessionId, id, createdAt, updatedAt, ...config } = editing as AiProviderConfig & { sessionId: string };
    await upsert.mutateAsync({ sessionId, config: config as Omit<AiProviderConfig, 'id' | 'createdAt' | 'updatedAt'> });
    setEditing({});
  };

  if (isLoading) return <div className="ai-loading">Loading...</div>;

  return (
    <div className="ai-providers">
      <div className="ai-header">
        <h1>AI Providers</h1>
        <p>Link WhatsApp sessions to AI backends</p>
        <button className="ai-btn-primary" onClick={handleNew}>+ New Provider</button>
      </div>

      <div className="ai-list">
        {(!configs || configs.length === 0) && (
          <div className="ai-empty">No AI providers configured.</div>
        )}
        {configs?.map((c) => {
          const sessionStatus = getSessionStatus(c.sessionId);
          return (
            <div key={c.id} className="ai-card">
              <div className="ai-card-header">
                <span className={`ai-status ${c.enabled ? 'enabled' : 'disabled'}`}>
                  {c.enabled ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div className="ai-card-body">
                <div className="ai-field"><label>Name</label><span>{c.name}</span></div>
                <div className="ai-field">
                  <label>Session</label>
                  <span className="ai-session-link">
                    <code>{c.sessionId}</code>
                    {sessionStatus && (
                      <span className={`ai-session-badge ${sessionStatus === 'ready' ? 'online' : 'offline'}`}>
                        {sessionStatus}
                      </span>
                    )}
                    {!sessionStatus && (
                      <span className="ai-session-badge unknown">not found</span>
                    )}
                  </span>
                </div>
                <div className="ai-field"><label>Endpoint</label><code>{c.baseUrl}</code></div>
                <div className="ai-field"><label>Model</label><span>{c.model}</span></div>
                <div className="ai-field"><label>Timeout</label><span>{c.timeoutMs}ms</span></div>
              </div>
              <div className="ai-card-actions">
                <button className="ai-btn" onClick={() => handleEdit(c)}>Edit</button>
                <button className="ai-btn" onClick={() => handleTest(c.sessionId)} disabled={testConn.isPending}>
                  {testConn.isPending ? 'Testing...' : 'Test'}
                </button>
                <button className="ai-btn-danger" onClick={() => handleDelete(c.sessionId)}>Remove</button>
              </div>
            </div>
          );
        })}
      </div>

      {testResult && (
        <div className="ai-test-result">
          <h3>Test Result</h3>
          <pre>{JSON.stringify(testResult, null, 2)}</pre>
          <button className="ai-btn" onClick={() => setTestResult(null)}>Close</button>
        </div>
      )}

      {editing.sessionId !== undefined && (
        <div className="ai-modal-overlay" onClick={() => setEditing({})}>
          <div className="ai-modal" onClick={(e) => e.stopPropagation()}>
            <h2>{editing.id ? 'Edit Provider' : 'New Provider'}</h2>

            <div className="ai-form">
              <label>
                WhatsApp Session *
                {editing.id ? (
                  <input value={editing.sessionId ?? ''} disabled />
                ) : sessionOptions.length === 0 ? (
                  <div className="ai-no-sessions">
                    No sessions available. <a href="/sessions">Create a WhatsApp session first</a>.
                  </div>
                ) : (
                  <select
                    value={editing.sessionId ?? ''}
                    onChange={(e) => setEditing({ ...editing, sessionId: e.target.value })}
                  >
                    <option value="">-- Select a session --</option>
                    {sessionOptions.map((s: any) => (
                      <option key={s.id} value={s.name}>
                        {s.name} {s.status === 'ready' ? '(online)' : '(' + s.status + ')'}
                      </option>
                    ))}
                  </select>
                )}
              </label>

              <label>
                Name *
                <input
                  value={editing.name ?? ''}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder="My AI Provider"
                />
              </label>

              <label>
                Base URL *
                <input
                  value={editing.baseUrl ?? ''}
                  onChange={(e) => setEditing({ ...editing, baseUrl: e.target.value })}
                  placeholder="https://api.openai.com"
                />
                <small>/v1/chat/completions is appended automatically</small>
              </label>

              <label>
                API Key *
                <input
                  type="password"
                  value={editing.apiKey ?? ''}
                  onChange={(e) => setEditing({ ...editing, apiKey: e.target.value })}
                  placeholder="sk-... or Bearer token"
                />
              </label>

              <label>
                Model *
                <input
                  value={editing.model ?? ''}
                  onChange={(e) => setEditing({ ...editing, model: e.target.value })}
                  placeholder="gpt-4o"
                />
              </label>

              <label>
                Timeout (ms)
                <input
                  type="number"
                  value={editing.timeoutMs ?? 30000}
                  onChange={(e) => setEditing({ ...editing, timeoutMs: parseInt(e.target.value) || 30000 })}
                />
              </label>

              <label className="ai-checkbox">
                <input
                  type="checkbox"
                  checked={editing.enabled ?? true}
                  onChange={(e) => setEditing({ ...editing, enabled: e.target.checked })}
                />
                Enabled
              </label>
            </div>

            <div className="ai-modal-actions">
              <button className="ai-btn" onClick={() => setEditing({})}>Cancel</button>
              <button className="ai-btn-primary" onClick={handleSave} disabled={upsert.isPending || !canSave}>
                {upsert.isPending ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}