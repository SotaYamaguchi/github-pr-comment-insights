import ky from 'ky';
import fs from 'fs';

const owner = 'YOUR_GITHUB_USERNAME';
const repo = 'YOUR_REPOSITORY_NAME';
const token = 'YOUR_PERSONAL_ACCESS_TOKEN';
const sinceDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();

const headers = {
    'Authorization': `token ${token}`,
    'Accept': 'application/vnd.github.v3+json'
};

async function fetchPullRequests() {
    const response = await ky.get(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
        headers: headers,
        searchParams: {
            state: 'all',
            since: sinceDate
        }
    });
    return response.json;
}

async function fetchReviewComments(pullNumber: number) {
    const response = await ky.get(`https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}/comments`, {
        headers: headers
    });
    return response.json;
}

async function main() {
    const pullRequests = await fetchPullRequests();

    const csvData = [['Pull Request Link', 'Pull Request Title', 'Review Comment', 'Comment Date']];

    // @ts-ignore
    for (const pr of pullRequests) {
        const comments = await fetchReviewComments(pr.number);
        // @ts-ignore
        for (const comment of comments) {
            csvData.push([
                pr.html_url,
                pr.title,
                comment.body,
                comment.created_at
            ]);
        }
    }

    fs.writeFileSync('output.csv', csvData.map(row => row.join(',')).join('\n'));
}

main().catch(error => {
    console.error('Error fetching data:', error);
});