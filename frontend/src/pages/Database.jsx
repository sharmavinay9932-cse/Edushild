import React, { useEffect, useState } from 'react';
import { Database, Key, Link2, Table2, Info, ChevronDown, ChevronRight } from 'lucide-react';
import PrimaryNavigation from '../components/layout/PrimaryNavigation.jsx';
import api from '../services/api.js';
import '../styles/data-pages.css';
import '../styles/database.css';

// ── helpers ────────────────────────────────────────────────────────────────
function TypeBadge({ type }) {
  const color =
    type === 'INTEGER' ? 'badge-blue'
    : type === 'REAL' ? 'badge-purple'
    : type === 'TEXT' ? 'badge-green'
    : 'badge-gray';
  return <span className={`db-type-badge ${color}`}>{type}</span>;
}

function StatCard({ label, value, sub }) {
  return (
    <div className="db-stat-card">
      <span className="db-stat-value">{value}</span>
      <span className="db-stat-label">{label}</span>
      {sub && <span className="db-stat-sub">{sub}</span>}
    </div>
  );
}

function TableCard({ table }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="db-table-card">
      <button
        className="db-table-header"
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="db-table-title">
          <Table2 size={16} aria-hidden="true" />
          <strong>{table.name}</strong>
          <span className="db-table-meta">{table.rowCount.toLocaleString()} rows · {table.columns.length} cols</span>
        </span>
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      </button>

      {open && (
        <div className="db-table-body">
          {/* Columns */}
          <h4 className="db-section-label"><Key size={13} /> Columns</h4>
          <div className="db-table-scroll">
            <table className="db-schema-table">
              <thead>
                <tr>
                  <th>#</th><th>Column</th><th>Type</th><th>PK</th><th>Not Null</th><th>Default</th>
                </tr>
              </thead>
              <tbody>
                {table.columns.map((col) => (
                  <tr key={col.cid} className={col.primaryKey ? 'db-pk-row' : ''}>
                    <td className="db-col-cid">{col.cid}</td>
                    <td>
                      <span className="db-col-name">
                        {col.primaryKey && <Key size={11} className="db-pk-icon" />}
                        {col.name}
                      </span>
                    </td>
                    <td><TypeBadge type={col.type} /></td>
                    <td>{col.primaryKey ? <span className="db-yes">YES</span> : '—'}</td>
                    <td>{col.notNull ? <span className="db-yes">YES</span> : '—'}</td>
                    <td className="db-default">{col.defaultValue ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Indexes */}
          {table.indexes.length > 0 && (
            <>
              <h4 className="db-section-label"><Info size={13} /> Indexes</h4>
              <ul className="db-index-list">
                {table.indexes.map((ix) => (
                  <li key={ix.name}>
                    <span className={`db-index-badge ${ix.unique ? 'idx-unique' : 'idx-normal'}`}>
                      {ix.unique ? 'UNIQUE' : 'INDEX'}
                    </span>
                    <code>{ix.name}</code>
                    <span className="db-index-cols">({ix.columns.join(', ')})</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {/* Foreign Keys */}
          {table.foreignKeys.length > 0 && (
            <>
              <h4 className="db-section-label"><Link2 size={13} /> Foreign Keys</h4>
              <ul className="db-fk-list">
                {table.foreignKeys.map((fk, i) => (
                  <li key={i}>
                    <code>{fk.from}</code>
                    <span className="db-fk-arrow">→</span>
                    <code>{fk.refTable}.{fk.refColumn}</code>
                    <span className="db-fk-meta">ON DELETE {fk.onDelete}</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {/* DDL */}
          <h4 className="db-section-label"><Database size={13} /> DDL</h4>
          <pre className="db-ddl">{table.ddl};</pre>
        </div>
      )}
    </div>
  );
}

// ── ER Diagram (SVG) ─────────────────────────────────────────────────────────
function ERDiagram() {
  return (
    <section className="db-er-section">
      <h3 className="db-section-title">Entity-Relationship Diagram</h3>
      <div className="db-er-wrap" role="img" aria-label="Entity relationship diagram for EduShield database">
        <svg viewBox="0 0 820 420" xmlns="http://www.w3.org/2000/svg" className="db-er-svg">
          {/* ── Defs ── */}
          <defs>
            <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
              <path d="M0,0 L0,6 L8,3 z" fill="#7d9ea8" />
            </marker>
          </defs>

          {/* ── users ── */}
          <rect x="30" y="60" width="200" height="230" rx="8" fill="#f0f7f6" stroke="#527b78" strokeWidth="1.5"/>
          <rect x="30" y="60" width="200" height="34" rx="8" fill="#527b78"/>
          <rect x="30" y="82" width="200" height="12" rx="0" fill="#527b78"/>
          <text x="130" y="83" textAnchor="middle" fill="white" fontSize="13" fontWeight="700">users</text>
          {[
            ['id', 'INTEGER PK'],['email','TEXT UNIQUE'],['display_name','TEXT'],
            ['role','TEXT'],['password_hash','TEXT'],['student_id','TEXT FK'],
            ['active','INTEGER'],['token_version','INTEGER'],['created_at','TEXT'],
          ].map(([col, type], i) => (
            <g key={col}>
              <text x="44" y={112 + i * 20} fontSize="11" fill={type.includes('PK') ? '#527b78' : '#263638'} fontWeight={type.includes('PK') ? '700' : '400'}>{col}</text>
              <text x="224" y={112 + i * 20} textAnchor="end" fontSize="10" fill="#8a96a8">{type}</text>
            </g>
          ))}

          {/* ── student_records ── */}
          <rect x="310" y="60" width="210" height="210" rx="8" fill="#f0f7f6" stroke="#527b78" strokeWidth="1.5"/>
          <rect x="310" y="60" width="210" height="34" rx="8" fill="#527b78"/>
          <rect x="310" y="82" width="210" height="12" rx="0" fill="#527b78"/>
          <text x="415" y="83" textAnchor="middle" fill="white" fontSize="13" fontWeight="700">student_records</text>
          {[
            ['student_id','TEXT PK'],['attendance','REAL'],['internal_marks','REAL'],
            ['previous_gpa','REAL'],['active_backlogs','INTEGER'],
            ['assignment_submission','REAL'],['lms_logins','INTEGER'],
            ['dropout','INTEGER'],['risk_level','TEXT'],
          ].map(([col, type], i) => (
            <g key={col}>
              <text x="324" y={112 + i * 20} fontSize="11" fill={type.includes('PK') ? '#527b78' : '#263638'} fontWeight={type.includes('PK') ? '700' : '400'}>{col}</text>
              <text x="514" y={112 + i * 20} textAnchor="end" fontSize="10" fill="#8a96a8">{type}</text>
            </g>
          ))}

          {/* ── interventions ── */}
          <rect x="590" y="60" width="210" height="210" rx="8" fill="#f0f7f6" stroke="#527b78" strokeWidth="1.5"/>
          <rect x="590" y="60" width="210" height="34" rx="8" fill="#527b78"/>
          <rect x="590" y="82" width="210" height="12" rx="0" fill="#527b78"/>
          <text x="695" y="83" textAnchor="middle" fill="white" fontSize="13" fontWeight="700">interventions</text>
          {[
            ['id','INTEGER PK'],['student_id','TEXT FK'],['title','TEXT'],
            ['notes','TEXT'],['status','TEXT'],['due_date','TEXT'],
            ['created_by','INTEGER FK'],['created_at','TEXT'],['updated_at','TEXT'],
          ].map(([col, type], i) => (
            <g key={col}>
              <text x="604" y={112 + i * 20} fontSize="11" fill={type.includes('PK') ? '#527b78' : '#263638'} fontWeight={type.includes('PK') ? '700' : '400'}>{col}</text>
              <text x="794" y={112 + i * 20} textAnchor="end" fontSize="10" fill="#8a96a8">{type}</text>
            </g>
          ))}

          {/* ── login_attempts ── */}
          <rect x="30" y="320" width="200" height="90" rx="8" fill="#fdf8f0" stroke="#c49a5e" strokeWidth="1.5"/>
          <rect x="30" y="320" width="200" height="34" rx="8" fill="#c49a5e"/>
          <rect x="30" y="342" width="200" height="12" rx="0" fill="#c49a5e"/>
          <text x="130" y="343" textAnchor="middle" fill="white" fontSize="13" fontWeight="700">login_attempts</text>
          {[['attempt_key','TEXT PK'],['attempts','INTEGER'],['locked_until','INTEGER']].map(([col, type], i) => (
            <g key={col}>
              <text x="44" y={368 + i * 16} fontSize="11" fill={type.includes('PK') ? '#c49a5e' : '#263638'} fontWeight={type.includes('PK') ? '700' : '400'}>{col}</text>
              <text x="224" y={368 + i * 16} textAnchor="end" fontSize="10" fill="#8a96a8">{type}</text>
            </g>
          ))}

          {/* ── dataset_metadata ── */}
          <rect x="310" y="300" width="210" height="72" rx="8" fill="#fdf8f0" stroke="#c49a5e" strokeWidth="1.5"/>
          <rect x="310" y="300" width="210" height="34" rx="8" fill="#c49a5e"/>
          <rect x="310" y="322" width="210" height="12" rx="0" fill="#c49a5e"/>
          <text x="415" y="323" textAnchor="middle" fill="white" fontSize="13" fontWeight="700">dataset_metadata</text>
          {[['key','TEXT PK'],['value','TEXT']].map(([col, type], i) => (
            <g key={col}>
              <text x="324" y={352 + i * 16} fontSize="11" fill={type.includes('PK') ? '#c49a5e' : '#263638'} fontWeight={type.includes('PK') ? '700' : '400'}>{col}</text>
              <text x="514" y={352 + i * 16} textAnchor="end" fontSize="10" fill="#8a96a8">{type}</text>
            </g>
          ))}

          {/* ── Relationship arrows ── */}
          {/* users.student_id → student_records.student_id (1:1 optional) */}
          <line x1="230" y1="172" x2="308" y2="112" stroke="#7d9ea8" strokeWidth="1.5" markerEnd="url(#arrow)" strokeDasharray="5,3"/>
          <text x="258" y="152" fontSize="9" fill="#7d9ea8">0..1</text>

          {/* interventions.student_id → student_records.student_id (N:1) */}
          <line x1="590" y1="131" x2="522" y2="112" stroke="#7d9ea8" strokeWidth="1.5" markerEnd="url(#arrow)"/>
          <text x="535" y="126" fontSize="9" fill="#7d9ea8">N:1</text>

          {/* interventions.created_by → users.id (N:1) */}
          <line x1="590" y1="151" x2="232" y2="111" stroke="#7d9ea8" strokeWidth="1.5" markerEnd="url(#arrow)" strokeDasharray="5,3"/>
          <text x="400" y="128" fontSize="9" fill="#7d9ea8">N:1</text>

          {/* Legend */}
          <g transform="translate(30, 412)">
            <line x1="0" y1="4" x2="24" y2="4" stroke="#7d9ea8" strokeWidth="1.5" markerEnd="url(#arrow)"/>
            <text x="28" y="8" fontSize="10" fill="#8a96a8">Foreign Key (solid = enforced, dashed = logical)</text>
          </g>
        </svg>
      </div>
    </section>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function DatabasePage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api.get('/admin/database')
      .then(({ data: d }) => { if (active) setData(d); })
      .catch((err) => {
        if (active)
          setError(err.response?.data?.detail || err.message || 'Unable to load database info.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const stats = data?.statistics;

  return (
    <main className="data-page">
      <header className="data-page-header" data-scroll-reveal>
        <div>
          <p className="eyebrow">EDUSHIELD <span>/</span> ADMINISTRATION</p>
          <h1>Database</h1>
          <p className="data-page-subtitle">Live schema, ER diagram, table statistics, and DDL.</p>
        </div>
        <PrimaryNavigation />
      </header>

      {loading && <div className="data-state" role="status">Loading database info…</div>}
      {error && <div className="data-state data-state-error" role="alert">{error}</div>}

      {!loading && !error && data && (
        <>
          {/* ── DB Meta Banner ── */}
          <section className="db-meta-banner" data-scroll-reveal>
            <div className="db-meta-item">
              <Database size={18} />
              <span><strong>Engine</strong>{data.engine}</span>
            </div>
            <div className="db-meta-item">
              <Table2 size={18} />
              <span><strong>Tables</strong>{data.tableCount}</span>
            </div>
            <div className="db-meta-item">
              <Info size={18} />
              <span><strong>DB size</strong>{data.sizeMb} MB</span>
            </div>
            <div className="db-meta-item">
              <Key size={18} />
              <span><strong>Schema file</strong><code>{data.schemaFile}</code></span>
            </div>
          </section>

          {/* ── Stats Row ── */}
          <section className="db-stats-grid" aria-label="Database statistics" data-scroll-reveal>
            <StatCard label="Total students" value={stats.totalStudents.toLocaleString()} />
            <StatCard label="Dropout labels" value={stats.dropoutStudents.toLocaleString()} sub={`${stats.dropoutRate}% rate`} />
            <StatCard label="Avg attendance" value={`${stats.avgAttendance}%`} />
            <StatCard label="High risk" value={(stats.riskDistribution?.High ?? 0).toLocaleString()} />
            <StatCard label="Medium risk" value={(stats.riskDistribution?.Medium ?? 0).toLocaleString()} />
            <StatCard label="Low risk" value={(stats.riskDistribution?.Low ?? 0).toLocaleString()} />
            <StatCard label="Users" value={stats.totalUsers.toLocaleString()} />
            <StatCard label="Interventions" value={stats.totalInterventions.toLocaleString()} />
          </section>

          {/* ── ER Diagram ── */}
          <div data-scroll-reveal>
            <ERDiagram />
          </div>

          {/* ── Table Schema Cards ── */}
          <section className="db-tables-section" data-scroll-reveal>
            <h3 className="db-section-title">Table Schemas</h3>
            <p className="dataset-disclaimer">
              Click any table to expand its columns, indexes, foreign keys, and full DDL.
            </p>
            <div className="db-table-list">
              {data.tables.map((table) => (
                <TableCard key={table.name} table={table} />
              ))}
            </div>
          </section>

          {/* ── Risk distribution inline ── */}
          <section className="db-risk-inline data-panel" data-scroll-reveal>
            <h3>Risk distribution (from student_records)</h3>
            <div className="db-risk-bars">
              {Object.entries(stats.riskDistribution).map(([level, count]) => {
                const pct = Math.round((count / stats.totalStudents) * 100);
                return (
                  <div key={level} className="db-risk-bar-row">
                    <span className={`data-risk data-risk-${level.toLowerCase()}`}>{level}</span>
                    <div className="db-bar-track">
                      <div
                        className={`db-bar-fill db-bar-${level.toLowerCase()}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="db-bar-label">{count.toLocaleString()} ({pct}%)</span>
                  </div>
                );
              })}
            </div>
          </section>

          <p className="dataset-disclaimer" data-scroll-reveal>
            All data is served live from the configured MySQL database.
            The schema is defined in <code>backend/schema.mysql.sql</code>.
          </p>
        </>
      )}
    </main>
  );
}
