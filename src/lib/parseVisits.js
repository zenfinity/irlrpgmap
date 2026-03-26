/**
 * Parse Google Takeout Semantic Location History JSON
 * and convert to an array of visit objects with real coordinates
 * and dwell time in minutes
 */
export function parseVisits(takeoutJson) {
	return takeoutJson.timelineObjects
		.filter((obj) => obj.placeVisit)
		.map((obj) => {
			const visit = obj.placeVisit;
			const lat = visit.location.latitudeE7 / 1e7;
			const lng = visit.location.longitudeE7 / 1e7;

			const start = new Date(visit.duration.startTimestamp);
			const end = new Date(visit.duration.endTimestamp);
			const dwellMinutes = (end - start) / 1000 / 60;

			return {
				lat,
				lng,
				name: visit.location.name || null,
				placeId: visit.location.placeId || null,
				start,
				end,
				dwellMinutes,
				confidence: visit.visitConfidence || 0
			};
		});
}

/**
 * Aggregate visits by placeId and compute a familiarity score
 * Score is based on visit count and total dwell time
 */
export function computeFamiliarity(visits) {
	const places = {};

	visits.forEach((visit) => {
		const key = visit.placeId || `${visit.lat.toFixed(4)},${visit.lng.toFixed(4)}`;

		if (!places[key]) {
			places[key] = {
				placeId: key,
				name: visit.name,
				lat: visit.lat,
				lng: visit.lng,
				visitCount: 0,
				totalDwellMinutes: 0
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
