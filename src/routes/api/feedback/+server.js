import { json, error } from '@sveltejs/kit';
import { GH_TOKEN } from '$env/static/private';

const REPO = 'zenfinity/irlrpgmap';

export async function POST({ request }) {
	let body;
	try {
		body = await request.json();
	} catch {
		error(400, 'Invalid JSON');
	}

	const { title, message } = body;
	if (!title?.trim() || !message?.trim()) error(400, 'Title and message are required');

	const res = await fetch(`https://api.github.com/repos/${REPO}/issues`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${GH_TOKEN}`,
			Accept: 'application/vnd.github+json',
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({ title: title.trim(), body: message.trim(), labels: ['feedback'] })
	});

	if (!res.ok) {
		const text = await res.text();
		console.error('GitHub API error:', res.status, text);
		error(502, 'Failed to submit feedback');
	}

	const issue = await res.json();
	return json({ url: issue.html_url });
}
