import type { ConversationChartSegment } from '../models/conversationInsights';

/**
 * Palette ordered to follow Cursor Conversation Insights category ranking
 * (greens → blues → warm accents), usable on both light and dark sidebars.
 */
export const CONVERSATION_CHART_COLORS = [
	'#2D6A4F',
	'#40916C',
	'#74C69D',
	'#1D3557',
	'#457B9D',
	'#A8DADC',
	'#778DA9',
	'#E9C46A',
	'#E76F51',
	'#9B2226',
	'#9B5DE5',
	'#F15BB5',
	'#118AB2',
	'#06D6A0',
	'#FFD166',
	'#EF476F',
];

export type DoughnutRenderOptions = {
	/** Available width hint in CSS pixels (sidebar). */
	width?: number;
};

export type PlacedLabel = {
	index: number;
	segment: ConversationChartSegment;
	color: string;
	startAngle: number;
	endAngle: number;
	midAngle: number;
	side: 'left' | 'right';
	sliceX: number;
	sliceY: number;
	elbowX: number;
	elbowY: number;
	labelX: number;
	labelY: number;
	anchor: 'start' | 'end';
	lines: string[];
	percentLabel: string;
	tooltip: string;
};

export type ChartLayout = {
	viewWidth: number;
	viewHeight: number;
	cx: number;
	cy: number;
	outerR: number;
	innerR: number;
	labelGap: number;
	elbowGap: number;
	fontSize: number;
	lineHeight: number;
	minLabelSpacing: number;
	sidePadding: number;
};

/**
 * Builds an SVG donut with leader lines, collision-avoiding external labels,
 * and data attributes for hover dimming in the webview.
 */
export function renderConversationDoughnut(
	segments: ConversationChartSegment[],
	options: DoughnutRenderOptions = {}
): string {
	if (segments.length === 0) {
		return '';
	}

	const total = segments.reduce((sum, segment) => sum + segment.count, 0);
	if (total <= 0) {
		return '';
	}

	const layout = computeLayout(segments.length, options.width ?? 260);
	const placed = buildPlacedLabels(segments, total, layout);

	const sliceNodes = placed.map((item) => renderSlice(item, layout));
	const leaderNodes = placed.map((item) => renderLeader(item));
	const labelNodes = placed.map((item) => renderLabel(item, layout.fontSize));

	return `
		<svg class="conversation-chart" viewBox="0 0 ${layout.viewWidth} ${layout.viewHeight}" role="img" aria-label="Conversation Insights chart" data-chart="conversation-donut">
			<g class="donut-slices">${sliceNodes.join('')}</g>
			<g class="donut-leaders">${leaderNodes.join('')}</g>
			<g class="donut-labels">${labelNodes.join('')}</g>
		</svg>`;
}

export function computeLayout(categoryCount: number, widthHint: number): ChartLayout {
	const viewWidth = Math.max(220, Math.min(320, Math.round(widthHint + 40)));
	const dense = categoryCount >= 10;
	const veryDense = categoryCount >= 15;
	const fontSize = veryDense ? 7.5 : dense ? 8 : 9;
	const lineHeight = fontSize + 2;
	const outerR = Math.round(Math.min(58, viewWidth * 0.18));
	const innerR = Math.round(outerR * 0.62);
	const sidePadding = dense ? 8 : 10;
	const labelStack =
		Math.ceil(categoryCount / 2) * (lineHeight + (dense ? 1 : 2)) + 24;
	const viewHeight = Math.max(viewWidth * 0.85, outerR * 2 + labelStack);

	return {
		viewWidth,
		viewHeight,
		cx: viewWidth / 2,
		cy: viewHeight / 2,
		outerR,
		innerR,
		labelGap: outerR + (dense ? 28 : 34),
		elbowGap: outerR + (dense ? 12 : 16),
		fontSize,
		lineHeight,
		minLabelSpacing: lineHeight + (dense ? 1 : 3),
		sidePadding,
	};
}

export function buildPlacedLabels(
	segments: ConversationChartSegment[],
	total: number,
	layout: ChartLayout
): PlacedLabel[] {
	let angle = -Math.PI / 2;
	const raw: PlacedLabel[] = [];

	segments.forEach((segment, index) => {
		const sweep = (segment.count / total) * Math.PI * 2;
		const start = angle;
		const end = angle + sweep;
		const mid = start + sweep / 2;
		const percentLabel = formatPercent(segment.percent);
		const side: 'left' | 'right' = Math.cos(mid) < 0 ? 'left' : 'right';
		const sliceX = layout.cx + Math.cos(mid) * layout.outerR;
		const sliceY = layout.cy + Math.sin(mid) * layout.outerR;
		const elbowX = layout.cx + Math.cos(mid) * layout.elbowGap;
		const elbowY = layout.cy + Math.sin(mid) * layout.elbowGap;
		const naturalY = layout.cy + Math.sin(mid) * layout.labelGap;
		const labelX =
			side === 'right'
				? layout.cx + layout.labelGap
				: layout.cx - layout.labelGap;
		const lines = wrapLabelText(`${segment.label}: ${percentLabel}`, layout);
		const color = CONVERSATION_CHART_COLORS[index % CONVERSATION_CHART_COLORS.length];

		raw.push({
			index,
			segment,
			color,
			startAngle: start,
			endAngle: end,
			midAngle: mid,
			side,
			sliceX,
			sliceY,
			elbowX,
			elbowY,
			labelX,
			labelY: naturalY,
			anchor: side === 'right' ? 'start' : 'end',
			lines,
			percentLabel,
			tooltip: `${segment.label}: ${segment.count} (${percentLabel})`,
		});

		angle = end;
	});

	resolveCollisions(
		raw.filter((item) => item.side === 'right'),
		layout
	);
	resolveCollisions(
		raw.filter((item) => item.side === 'left'),
		layout
	);

	for (const item of raw) {
		item.labelX =
			item.side === 'right'
				? Math.min(layout.viewWidth - layout.sidePadding, item.labelX)
				: Math.max(layout.sidePadding, item.labelX);
		item.elbowX =
			item.side === 'right'
				? Math.min(item.labelX - 4, item.elbowX)
				: Math.max(item.labelX + 4, item.elbowX);
	}

	return raw;
}

/**
 * Sort by Y and push labels apart so neighbouring labels on the same side
 * keep at least minLabelSpacing between baselines.
 */
export function resolveCollisions(
	items: Array<{ labelY: number; lines: string[] }>,
	layout: Pick<
		ChartLayout,
		'minLabelSpacing' | 'lineHeight' | 'viewHeight' | 'sidePadding'
	>
): void {
	if (items.length === 0) {
		return;
	}

	items.sort((a, b) => a.labelY - b.labelY);

	const heights = items.map(
		(item) => Math.max(1, item.lines.length) * layout.lineHeight
	);

	for (let i = 1; i < items.length; i++) {
		const prevBottom = items[i - 1].labelY + heights[i - 1] / 2;
		const minTop = prevBottom + layout.minLabelSpacing;
		const currentTop = items[i].labelY - heights[i] / 2;
		if (currentTop < minTop) {
			items[i].labelY = minTop + heights[i] / 2;
		}
	}

	const maxY = layout.viewHeight - layout.sidePadding;
	for (let i = items.length - 1; i >= 0; i--) {
		const half = heights[i] / 2;
		if (items[i].labelY + half > maxY) {
			items[i].labelY = maxY - half;
		}
	}

	const minY = layout.sidePadding;
	for (let i = 0; i < items.length; i++) {
		const half = heights[i] / 2;
		if (items[i].labelY - half < minY) {
			items[i].labelY = minY + half;
		}
		if (i > 0) {
			const prevBottom = items[i - 1].labelY + heights[i - 1] / 2;
			const minTop = prevBottom + layout.minLabelSpacing;
			const currentTop = items[i].labelY - half;
			if (currentTop < minTop) {
				items[i].labelY = minTop + half;
			}
		}
	}
}

export function wrapLabelText(text: string, layout: ChartLayout): string[] {
	const maxChars = Math.max(
		12,
		Math.floor(
			(layout.viewWidth / 2 - layout.outerR - 20) / (layout.fontSize * 0.55)
		)
	);
	if (text.length <= maxChars) {
		return [text];
	}

	const words = text.split(/\s+/);
	const lines: string[] = [];
	let current = '';
	for (const word of words) {
		const next = current ? `${current} ${word}` : word;
		if (next.length > maxChars && current) {
			lines.push(current);
			current = word;
		} else {
			current = next;
		}
	}
	if (current) {
		lines.push(current);
	}
	return lines.length > 0 ? lines : [text];
}

function renderSlice(item: PlacedLabel, layout: ChartLayout): string {
	const sweep = item.endAngle - item.startAngle;
	let shape: string;

	if (sweep >= Math.PI * 2 - 1e-6) {
		shape =
			`<circle class="donut-slice" cx="${layout.cx}" cy="${layout.cy}" r="${layout.outerR}" fill="${item.color}"></circle>` +
			`<circle cx="${layout.cx}" cy="${layout.cy}" r="${layout.innerR}" fill="var(--vscode-sideBar-background, var(--vscode-editor-background))"></circle>`;
	} else if (sweep <= 1e-6) {
		shape = '';
	} else {
		shape = `<path class="donut-slice" d="${donutSlicePath(layout.cx, layout.cy, layout.innerR, layout.outerR, item.startAngle, item.endAngle)}" fill="${item.color}" stroke="var(--vscode-sideBar-background, var(--vscode-editor-background))" stroke-width="1"></path>`;
	}

	return `<g class="donut-item" data-index="${item.index}" data-label="${escapeXml(item.segment.label)}">
		${shape}
		<title>${escapeXml(item.tooltip)}</title>
	</g>`;
}

function renderLeader(item: PlacedLabel): string {
	const labelJoinX =
		item.side === 'right' ? item.labelX - 2 : item.labelX + 2;
	const path = [
		`M ${item.sliceX.toFixed(1)} ${item.sliceY.toFixed(1)}`,
		`L ${item.elbowX.toFixed(1)} ${item.elbowY.toFixed(1)}`,
		`L ${labelJoinX.toFixed(1)} ${item.labelY.toFixed(1)}`,
	].join(' ');

	return `<path class="donut-leader" data-index="${item.index}" d="${path}" fill="none" stroke="var(--vscode-foreground)" stroke-width="1" stroke-opacity="0.45"></path>`;
}

function renderLabel(item: PlacedLabel, fontSize: number): string {
	const tspans = item.lines
		.map((line, lineIndex) => {
			const dy =
				lineIndex === 0
					? `${(-((item.lines.length - 1) * (fontSize + 2)) / 2).toFixed(1)}`
					: `${(fontSize + 2).toFixed(1)}`;
			return `<tspan x="${item.labelX.toFixed(1)}" dy="${dy}">${escapeXml(line)}</tspan>`;
		})
		.join('');

	return `<text class="chart-label" data-index="${item.index}" x="${item.labelX.toFixed(1)}" y="${item.labelY.toFixed(1)}" text-anchor="${item.anchor}" dominant-baseline="middle" font-size="${fontSize}">${tspans}<title>${escapeXml(item.tooltip)}</title></text>`;
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

export function formatPercent(percent: number): string {
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

/**
 * Client-side hover script: emphasize the hovered category and dim the rest.
 */
export function conversationChartHoverScript(): string {
	return `
		(function setupConversationChartHover() {
			const chart = document.querySelector('[data-chart="conversation-donut"]');
			if (!chart) {
				return;
			}
			const indexed = Array.from(chart.querySelectorAll('[data-index]'));
			const setActive = (index) => {
				indexed.forEach((el) => {
					const active = index !== null && el.getAttribute('data-index') === index;
					const dimmed = index !== null && !active;
					el.classList.toggle('is-active', active);
					el.classList.toggle('is-dimmed', dimmed);
				});
			};
			indexed.forEach((el) => {
				el.addEventListener('mouseenter', () => {
					setActive(el.getAttribute('data-index'));
				});
				el.addEventListener('mouseleave', () => {
					setActive(null);
				});
			});
		})();
	`;
}
