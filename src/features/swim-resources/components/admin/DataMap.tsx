'use client';

import Link from 'next/link';
import { useState } from 'react';
import { DATA_NODES, DATA_RELATIONSHIPS, mapNeighborhood, mapRelationships, SIMPLIFICATION_NOTES, type DataNode, type MapGroup } from '@/features/swim-resources/lib/domain/data-map';

const groups: MapGroup[] = ['Directory', 'Performance', 'Coaching', 'Import', 'Evidence'];
function Diagram({ nodes, selected, overview, ownership, onSelect }: { nodes: DataNode[]; selected: string; overview: boolean; ownership: boolean; onSelect: (id: string) => void }) {
  const incoming = new Set(DATA_RELATIONSHIPS.filter(edge => edge.to === selected && (ownership || edge.kind !== 'ownership')).map(edge => edge.from));
  const outgoing = new Set(DATA_RELATIONSHIPS.filter(edge => edge.from === selected && (ownership || edge.kind !== 'ownership')).map(edge => edge.to));
  const left = nodes.filter(node => node.id !== selected && incoming.has(node.id) && !outgoing.has(node.id));
  const right = nodes.filter(node => node.id !== selected && !left.includes(node));
  const focusRows = Math.max(left.length, right.length, 1);
  const positions = new Map(nodes.map(node => {
    if (overview) return [node.id, { x: 24 + groups.indexOf(node.group) * 270, y: 48 + nodes.filter(other => other.group === node.group).indexOf(node) * 82 }];
    if (node.id === selected) return [node.id, { x: 294, y: 48 + (focusRows - 1) * 41 }];
    const isLeft = left.includes(node);
    return [node.id, { x: isLeft ? 24 : 564, y: 48 + (isLeft ? left : right).indexOf(node) * 82 }];
  }));
  const edges = overview ? DATA_RELATIONSHIPS.filter(edge => ownership || edge.kind !== 'ownership') : mapRelationships(selected, ownership);
  const height = Math.max(200, ...[...positions.values()].map(p => p.y + 90));
  const width = overview ? 1360 : 820;
  return <div className="admin-map-scroll" tabIndex={0} aria-label="Relationship diagram; scroll horizontally on small screens">
    <svg viewBox={`0 0 ${width} ${height}`} style={{ minWidth: width, maxWidth: width, width: '100%', height: 'auto' }} role="group" aria-label="Collection relationships. Arrows run from a referencing collection to its target; derived arrows run from source to projection.">
      <defs><marker id="map-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" /></marker></defs>
      {overview && groups.map((group, index) => <text key={group} x={24 + index * 270} y={23} className="admin-map-heading">{group}</text>)}
      {edges.map((edge, index) => {
        const from = positions.get(edge.from), to = positions.get(edge.to);
        if (!from || !to) return null;
        const related = edge.from === selected || edge.to === selected;
        const x1 = from.x + 116, y1 = from.y + 28, x2 = to.x + 116, y2 = to.y + 28;
        // Connect the perimeter, rather than hiding the arrowhead behind the target node.
        const dx = x1 - x2, dy = y1 - y2;
        const scale = Math.min(116 / (Math.abs(dx) || 1), 28 / (Math.abs(dy) || 1));
        return <path key={`${edge.from}-${edge.to}-${index}`} d={`M ${x1} ${y1} L ${x2 + dx * scale} ${y2 + dy * scale}`} className="admin-map-edge" opacity={overview && !related ? .12 : .65} strokeDasharray={edge.kind === 'projection' || edge.kind === 'workflow' ? '5 4' : undefined} markerEnd="url(#map-arrow)"><title>{edge.from} → {edge.to}: {edge.field} ({edge.kind})</title></path>;
      })}
      {nodes.map(node => {
        const p = positions.get(node.id)!;
        return <g key={node.id} role="button" tabIndex={0} aria-label={`Inspect ${node.label}`} aria-pressed={selected === node.id} className="admin-map-node" onClick={() => onSelect(node.id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(node.id); } }}>
          <rect x={p.x} y={p.y} width="232" height="56" strokeWidth={selected === node.id ? 3 : 1} />
          <text x={p.x + 10} y={p.y + 23}>{node.label}</text><text x={p.x + 10} y={p.y + 43} className="admin-map-path">{node.id}</text>
        </g>;
      })}
    </svg>
  </div>;
}
export default function DataMap() {
  const [selected, setSelected] = useState('meets');
  const [overview, setOverview] = useState(false);
  const [ownership, setOwnership] = useState(false);
  const [search, setSearch] = useState('');
  const current = DATA_NODES.find(node => node.id === selected)!;
  const relationships = mapRelationships(selected);
  const nodes = overview ? DATA_NODES : mapNeighborhood(selected, ownership);
  const catalog = DATA_NODES.filter(node => `${node.label} ${node.id} ${node.purpose}`.toLowerCase().includes(search.toLowerCase()));
  return <>
    <h1>Data map</h1>
    <p>Explore {DATA_NODES.length} registered collection structures and their relationships. Select a collection to inspect its links and open stored documents.</p>
    <p>This describes the fresh declared model, not a live inventory or integrity audit. Optional links may be absent. It does not read or change database records.</p>
    <div className="admin-controls">
      <label>Collection <select value={selected} onChange={event => setSelected(event.target.value)}>{DATA_NODES.map(node => <option key={node.id} value={node.id}>{node.label} — {node.id}</option>)}</select></label>
      <label><input type="checkbox" checked={overview} onChange={event => setOverview(event.target.checked)} />Show all collections</label>
      <label><input type="checkbox" checked={ownership} onChange={event => setOwnership(event.target.checked)} />Show team ownership arrows</label>
    </div>
    <p>Solid arrows: stored references or subcollections. Dashed arrows: derived data or workflow coordination. Select a node to highlight its relationships; the table below gives exact fields. Ownership arrows are hidden by default to reduce clutter.</p>
    <Diagram nodes={nodes} selected={selected} overview={overview} ownership={ownership} onSelect={setSelected} />
    <section className="admin-section" aria-labelledby="map-detail">
      <h2 id="map-detail">{current.label}</h2>
      <p><code>{current.path}</code> · {current.storage} · {current.public ? 'Public read access' : 'Verified coaches only'}</p>
      <p>{current.purpose}</p>
      <p><Link href={current.href}>{current.id.includes('/') ? 'Open parent collection, then choose a document to inspect this subcollection' : 'Open collection viewer'}</Link></p>
      <p>Viewer fields: {current.fields.length ? current.fields.map(field => <code key={field} className="admin-map-field">{field}</code>) : 'No configured columns.'} Document viewers expose all stored fields, including nested values.</p>
      <div className="admin-table-scroll"><table><caption>All relationships for {current.label}, including ownership</caption><thead><tr><th>From</th><th>Field / derivation</th><th>To</th><th>Kind</th><th>Meaning</th></tr></thead><tbody>
        {relationships.map((edge, index) => <tr key={index}><td><button onClick={() => setSelected(edge.from)}>{edge.from}</button></td><td><code>{edge.field}</code></td><td><button onClick={() => setSelected(edge.to)}>{edge.to}</button></td><td>{edge.kind}</td><td>{edge.note}</td></tr>)}
        {!relationships.length && <tr><td colSpan={5}>No explicit links are registered for this collection. Shared labels or concepts do not guarantee stored IDs.</td></tr>}
      </tbody></table></div>
    </section>
    <section className="admin-section" aria-labelledby="map-review"><h2 id="map-review">Simplification review</h2><p>These are investigation candidates, not approved migrations or deletions. Open documents to compare the actual stored shapes and evidence.</p>
      {SIMPLIFICATION_NOTES.filter(note => overview || note.nodes.includes(selected)).map(note => <div key={note.title}><h3>{note.title}</h3><p>{note.text}</p><div className="admin-controls">{note.nodes.map(id => <button key={id} onClick={() => setSelected(id)}>{id}</button>)}</div></div>)}
      {!overview && !SIMPLIFICATION_NOTES.some(note => note.nodes.includes(selected)) && <p>No specific consolidation candidate is listed for this collection. Enable all collections to see the full review list.</p>}
    </section>
    <section className="admin-section" aria-labelledby="map-catalog"><h2 id="map-catalog">Collection catalog</h2>
      <label>Search schema descriptions <input type="search" value={search} onChange={event => setSearch(event.target.value)} /></label>
      <div className="admin-table-scroll"><table><thead><tr><th>Collection / path</th><th>Group</th><th>Storage role</th><th>Access</th><th>Inspect</th></tr></thead><tbody>{catalog.map(node => <tr key={node.id}><td><button onClick={() => setSelected(node.id)}>{node.label}</button><br /><code>{node.path}</code></td><td>{node.group}</td><td>{node.storage}</td><td>{node.public ? 'Public reads' : 'Private'}</td><td><Link href={node.href}>{node.id.includes('/') ? 'Choose parent document' : 'View documents'}</Link></td></tr>)}</tbody></table></div>
      {!catalog.length && <p role="status">No collection descriptions match this search.</p>}
    </section>
  </>;
}
