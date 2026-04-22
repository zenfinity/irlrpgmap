/**
 * @typedef {{
 *   location: { latitudeE7: number, longitudeE7: number, name?: string, placeId?: string },
 *   duration: { startTimestamp: string, endTimestamp: string },
 *   visitConfidence?: number
 * }} TakeoutPlaceVisit
 *
 * @typedef {{ timelineObjects: Array<{ placeVisit?: TakeoutPlaceVisit }> }} TakeoutJson
 *
 * @typedef {{
 *   lat: number, lng: number,
 *   name: string|null, placeId: string|null,
 *   neighborhood: string|null,
 *   start: Date, end: Date,
 *   dwellMinutes: number, confidence: number
 * }} Visit
 *
 * @typedef {{
 *   placeId: string, name: string|null,
 *   lat: number, lng: number,
 *   neighborhood: string|null,
 *   visitCount: number, totalDwellMinutes: number,
 *   familiarityScore: number
 * }} Place
 */

/**
 * Parse Google Takeout Semantic Location History JSON (old format)
 * and convert to an array of visit objects with real coordinates
 * and dwell time in minutes
 *
 * @param {TakeoutJson} takeoutJson
 * @returns {Visit[]}
 */
function parseLegacyTakeout(takeoutJson) {
	return takeoutJson.timelineObjects
		.filter((obj) => obj.placeVisit)
		.map((obj) => {
			const visit = /** @type {TakeoutPlaceVisit} */ (obj.placeVisit);
			const lat = visit.location.latitudeE7 / 1e7;
			const lng = visit.location.longitudeE7 / 1e7;

			const start = new Date(visit.duration.startTimestamp);
			const end = new Date(visit.duration.endTimestamp);
			const dwellMinutes = (end.getTime() - start.getTime()) / 1000 / 60;

			return {
				lat,
				lng,
				name: visit.location.name || null,
				placeId: visit.location.placeId || null,
				neighborhood: null,
				start,
				end,
				dwellMinutes,
				confidence: visit.visitConfidence || 0
			};
		});
}

/**
 * Parse the new Google Maps on-device Timeline export format.
 * Root is an array; visits have a `visit` key with topCandidate.placeLocation.
 *
 * @param {Array<any>} entries
 * @returns {Visit[]}
 */
function parseNewTimeline(entries) {
	/** @type {Visit[]} */
	const visits = [];

	for (const entry of entries) {
		if (!entry.visit) continue; // skip activity/travel segments

		const candidate = entry.visit.topCandidate;
		if (!candidate?.placeLocation) continue;

		// placeLocation is "geo:lat,lng"
		const geoMatch = candidate.placeLocation.match(/^geo:([-\d.]+),([-\d.]+)$/);
		if (!geoMatch) continue;

		const lat = parseFloat(geoMatch[1]);
		const lng = parseFloat(geoMatch[2]);
		if (!isFinite(lat) || !isFinite(lng)) continue;

		const start = new Date(entry.startTime);
		const end = new Date(entry.endTime);
		const dwellMinutes = (end.getTime() - start.getTime()) / 1000 / 60;

		// Use semanticType as name when it's meaningful
		const semanticType = candidate.semanticType;
		const name = (semanticType && semanticType !== 'Unknown') ? semanticType : null;

		visits.push({
			lat,
			lng,
			name,
			placeId: candidate.placeID || null,
			neighborhood: null,
			start,
			end,
			dwellMinutes,
			confidence: parseFloat(candidate.probability ?? '0') || 0
		});
	}

	return visits;
}

/**
 * Parse a Google location history export — auto-detects old Takeout format
 * ({ timelineObjects: [...] }) and new on-device Timeline format ([...]).
 *
 * @param {any} data
 * @returns {Visit[]}
 */
export function parseVisits(data) {
	if (Array.isArray(data)) {
		return parseNewTimeline(data);
	}
	if (data?.timelineObjects) {
		return parseLegacyTakeout(data);
	}
	throw new Error('Unrecognised format');
}

/**
 * Aggregate visits by placeId and compute a familiarity score.
 * Score is based on visit count and total dwell time.
 * Neighborhood is taken from the first visit for a given place.
 *
 * @param {Visit[]} visits
 * @returns {Place[]}
 */
export function computeFamiliarity(visits) {
	/** @type {Record<string, Place>} */
	const places = {};

	visits.forEach((visit) => {
		const key = visit.placeId || `${visit.lat.toFixed(4)},${visit.lng.toFixed(4)}`;

		if (!places[key]) {
			places[key] = {
				placeId: key,
				name: visit.name,
				lat: visit.lat,
				lng: visit.lng,
				neighborhood: visit.neighborhood ?? null,
				visitCount: 0,
				totalDwellMinutes: 0,
				familiarityScore: 0
			};
		}

		places[key].visitCount += 1;
		places[key].totalDwellMinutes += visit.dwellMinutes;
	});

	// normalize scores to 0-1 range
	const allPlaces = Object.values(places);
	const maxDwell = Math.max(...allPlaces.map((p) => p.totalDwellMinutes));
	const maxVisits = Math.max(...allPlaces.map((p) => p.visitCount));

	allPlaces.forEach((place) => {
		const dwellScore = place.totalDwellMinutes / maxDwell;
		const visitScore = place.visitCount / maxVisits;
		place.familiarityScore = dwellScore * 0.6 + visitScore * 0.4;
	});

	return allPlaces.sort((a, b) => b.familiarityScore - a.familiarityScore);
}
