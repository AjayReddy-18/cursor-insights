import type { ConversationChartSegment } from '../models/conversationInsights';

const CHART_COLORS = [
	'var(--vscode-charts-blue)',
	'var(--vscode-charts-green)',
	'var(--vscode-charts-orange)',
	'var(--vscode-charts-purple)',
	'var(--vscode-charts-yellow)',
	'var(--vscode-charts-red)',
];

const VIEWBOX = 220;
const CENTER = VIEWBOX / 2;
const OUTER_RADIUS = 62;
const INNER_RADIUS = 38;
const LABEL_RADIUS = 88;

/**
 * Builds an SVG doughnut with perimeter labels (name + percent) and hover titles.
 */
export function renderConversationDoughnut(
	segments: ConversationChartSegment[]
): string {
	if (segments.length === 0) {
		return '';
	}

	const total = segments.reduce((sum, segment) => sum + segment.count, 0);
	if (total <= 0) {
		return '';
	}

	let angle = -Math.PI / 2;
	const slices: string[] = [];
	const labels: string[] = [];

	segments.forEach((segment, index) => {
		const sweep = (segment.count / total) * Math.PI * 2;
		const start = angle;
		const end = angle + sweep;
		const mid = start + sweep / 2;
		const color = CHART_COLORS[index % CHART_COLORS.length];
		const percentLabel = formatPercent(segment.percent);
		const tooltip = `${escapeXml(segment.label)}: ${segment.count} (${percentLabel})`;

		if (sweep >= Math.PI * 2 - 1e-6) {
			slices.push(
				`<circle cx="${CENTER}" cy="${CENTER}" r="${OUTER_RADIUS}" fill="${color}"><title>${tooltip}</title></circle>` +
					`<circle cx="${CENTER}" cy="${CENTER}" r="${INNER_RADIUS}" fill="var(--vscode-sideBar-background, var(--vscode-editor-background))"></circle>`
			);
		} else if (sweep > 1e-6) {
			slices.push(
				`<path d="${donutSlicePath(CENTER, CENTER, INNER_RADIUS, OUTER_RADIUS, start, end)}" fill="${color}"><title>${tooltip}</title></path>`
			);
		}

		const lx = CENTER + Math.cos(mid) * LABEL_RADIUS;
		const ly = CENTER + Math.sin(mid) * LABEL_RADIUS;
		const anchor =
			Math.abs(Math.cos(mid)) < 0.2
				? 'middle'
				: Math.cos(mid) > 0
					? 'start'
					: 'end';

		labels.push(
			`<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="${anchor}" dominant-baseline="middle" class="chart-label">${escapeXml(segment.label)}: ${percentLabel}</text>`
		);

		angle = end;
	});

	return `
		<svg class="conversation-chart" viewBox="0 0 ${VIEWBOX} ${VIEWBOX}" role="img" aria-label="Conversation Insights chart">
			${slices.join('')}
			${labels.join('')}
		</svg>`;
}

function donutSlicePath(
	cx: number,
	cy: number,
	innerR: number,
	outerR: number,
	start: number,
	end: number
): string {
	const largeArc = end - start > Math.PI ? 1 : 0;
	const ox1 = cx + Math.cos(start) * outerR;
	const oy1 = cy + Math.sin(start) * outerR;
	const ox2 = cx + Math.cos(end) * outerR;
	const oy2 = cy + Math.sin(end) * outerR;
	const ix1 = cx + Math.cos(end) * innerR;
	const iy1 = cy + Math.sin(end) * innerR;
	const ix2 = cx + Math.cos(start) * innerR;
	const iy2 = cy + Math.sin(start) * innerR;

	return [
		`M ${ox1} ${oy1}`,
		`A ${outerR} ${outerR} 0 ${largeArc} 1 ${ox2} ${oy2}`,
		`L ${ix1} ${iy1}`,
		`A ${innerR} ${innerR} 0 ${largeArc} 0 ${ix2} ${iy2}`,
		'Z',
	].join(' ');
}

function formatPercent(percent: number): string {
	const rounded = Math.round(percent * 10) / 10;
	return Number.isInteger(rounded)
		? `${rounded}%`
		: `${rounded.toFixed(1)}%`;
}

function escapeXml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}
