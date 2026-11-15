import { useEffect, useId, useMemo, useState } from 'react';
import type { EvidenceCollection, EvidenceType, ImageryLayer } from '../lib/nasaData';
import { imageryPixel } from '../lib/nasaData';
import type { LunarCoordinate } from '../lib/lunar';

const COLORS: Record<EvidenceType, string> = { ice_detection: '#67e8f9', cold_conditions: '#a78bfa', resource_potential: '#fbbf24' };

export function NasaImageryMap({ layer, coordinate, evidence, kinds }: {
  layer: ImageryLayer; coordinate: LunarCoordinate; evidence?: EvidenceCollection; kinds: EvidenceType[];
}) {
  const [zoom, setZoom] = useState(5), [pan, setPan] = useState<[number, number]>([0, 0]);
  const [failed, setFailed] = useState<string[]>([]), [retry, setRetry] = useState(0);
  const clipId = useId().replace(/:/g, '');
  useEffect(() => { setPan([0, 0]); setFailed([]); }, [layer.id, coordinate.lat, coordinate.lon, zoom]);
  useEffect(() => { setZoom(Math.min(5, layer.matrices.length - 1)); }, [layer.id]);
  const covered = layer.projection !== 'south' || coordinate.lat <= (layer.id === 'cold' ? -80 : -60);
  const index = Math.min(zoom, layer.matrices.length - 1), matrix = layer.matrices[index];
  const width = 640, height = 400;
  const centre = imageryPixel(layer, matrix, coordinate.lat, coordinate.lon);
  const origin: [number, number] = [centre[0] + pan[0] - width / 2, centre[1] + pan[1] - height / 2];
  const tiles = useMemo(() => {
    const list: { key: string; url: string; x: number; y: number }[] = [];
    if (!covered) return list;
    for (let row = Math.floor(origin[1] / matrix.tile_height); row <= Math.floor((origin[1] + height) / matrix.tile_height); row++) {
      for (let col = Math.floor(origin[0] / matrix.tile_width); col <= Math.floor((origin[0] + width) / matrix.tile_width); col++) {
        if (row < 0 || row >= matrix.height || (layer.projection !== 'eq' && (col < 0 || col >= matrix.width))) continue;
        const wrapped = (col % matrix.width + matrix.width) % matrix.width;
        const url = layer.endpoint + '/1.0.0/' + layer.style + '/' + layer.matrix_set + '/' + matrix.id + '/' + row + '/' + wrapped + '.' + layer.extension;
        list.push({ key: [layer.id, matrix.id, row, col, retry].join('-'), url, x: col * matrix.tile_width - origin[0], y: row * matrix.tile_height - origin[1] });
      }
    }
    return list;
  }, [layer, matrix, origin[0], origin[1], retry, covered]);
  const screen = (pair: number[]) => {
    let [x, y] = imageryPixel(layer, matrix, pair[1], pair[0]);
    if (layer.projection === 'eq') {
      const world = matrix.width * matrix.tile_width;
      x += Math.round((centre[0] - x) / world) * world;
    }
    return [x - origin[0], y - origin[1]];
  };
  const move = (dx: number, dy: number) => setPan(([x, y]) => [x + dx, y + dy]);
  if (!covered) return <div className="nasa-map"><p role="status">This south-polar layer does not cover the selected site. Choose LROC global imagery to view this location.</p><p className="nasa-note">{layer.note}</p></div>;
  return <div className="nasa-map">
    <div className="nasa-map-tools">
      <button onClick={() => setZoom(z => Math.max(0, z - 1))} disabled={index === 0} aria-label="Zoom out of NASA imagery">−</button>
      <span>Native zoom {index + 1} / {layer.matrices.length}</span>
      <button onClick={() => setZoom(z => Math.min(layer.matrices.length - 1, z + 1))} disabled={index === layer.matrices.length - 1} aria-label="Zoom into NASA imagery">+</button>
      <button onClick={() => setPan([0, 0])}>Centre on site</button>
      <button onClick={() => move(-160, 0)} aria-label="Pan map left">←</button>
      <button onClick={() => move(0, -120)} aria-label="Pan map up">↑</button>
      <button onClick={() => move(0, 120)} aria-label="Pan map down">↓</button>
      <button onClick={() => move(160, 0)} aria-label="Pan map right">→</button>
    </div>
    <svg viewBox={'0 0 ' + width + ' ' + height} role="img" aria-label={layer.title + ' at the selected lunar site. Use the map controls to pan and zoom.'}>
      <defs><clipPath id={clipId}><rect width={width} height={height} /></clipPath></defs>
      <rect width={width} height={height} fill="#111d2a" />
      <g clipPath={'url(#' + clipId + ')'}>
        {tiles.map(tile => <image key={tile.key} href={tile.url} x={tile.x} y={tile.y} width={matrix.tile_width + .2} height={matrix.tile_height + .2} preserveAspectRatio="none"
          onError={() => setFailed(old => old.includes(tile.url) ? old : [...old, tile.url])} />)}
        {evidence?.features.filter(f => kinds.includes(f.properties.evidence_type)).map((feature, i) => {
          const color = COLORS[feature.properties.evidence_type];
          if (feature.geometry.type === 'Point') {
            const [x, y] = screen(feature.geometry.coordinates);
            return <circle key={i} cx={x} cy={y} r={5} fill={color} stroke="#07121e"><title>{feature.properties.name}</title></circle>;
          }
          const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
          const path = polygons.map(polygon => polygon.map(ring => ring.map((pair, n) => (n ? 'L' : 'M') + screen(pair).join(',')).join(' ') + 'Z').join(' ')).join(' ');
          return <path key={i} d={path} fill={color} fillOpacity={.3} fillRule="evenodd" stroke={color} strokeWidth={1.5}><title>{feature.properties.name}</title></path>;
        })}
        <path d={'M' + (width / 2 - pan[0] - 10) + ',' + (height / 2 - pan[1]) + 'h20 M' + (width / 2 - pan[0]) + ',' + (height / 2 - pan[1] - 10) + 'v20'} stroke="white" strokeWidth="2" />
      </g>
    </svg>
    {failed.length > 0 && <p role="status">{failed.length} imagery tiles could not load or have no coverage. <button onClick={() => { setFailed([]); setRetry(r => r + 1); }}>Retry map</button></p>}
    <p className="nasa-note">{layer.note} {layer.projection === 'eq' && Math.abs(coordinate.lat) > 80 && 'This global equirectangular mosaic is strongly distorted near the pole.'}</p>
    <p className="nasa-note">{layer.attribution}. <a href={layer.source_url} target="_blank" rel="noreferrer">Product source</a></p>
  </div>;
}
