import fs from 'fs';
import axios from "axios";

const OWNER = 'SotaYamaguchi';
const REPO = 'github-pr-comment-insights';
const TOKEN = '';
const SINCE_DATE = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();

const QUERY = `
  query GetRecentPRs($owner: String!, $repo: String!) {
    repository(owner: $owner, name: $repo) {
      pullRequests(first: 100, states: [OPEN, CLOSED, MERGED], orderBy: {field: CREATED_AT, direction: DESC}) {
        edges {
          node {
            title
            url
            createdAt
            reviews(first: 100) {
              edges {
                node {
                  body
                  createdAt
                  comments(first: 10) {
                    edges {
                      node {
                        body
                        createdAt
                      }
                    }
                  }
                }
              }
            }
            comments(first: 10) {
              edges {
                node {
                  body
                  createdAt
                }
              }
            }
          }
        }
      }
    }
  }
`;

async function fetchReviewComments() {
    try {
        const response = await axios.post('https://api.github.com/graphql', {
            query: QUERY,
            variables: {
                owner: OWNER,
                repo: REPO
            }
        }, {
            headers: {
                'Authorization': `Bearer ${TOKEN}`
            }
        });

        return response.data.data.repository.pullRequests.edges;
    } catch (error) {
        console.error("Error fetching PRs:", error);
    }
}

// @ts-ignore
function processComments(edges, csvData, pr) {
    for (const edge of edges) {
        const comment = edge.node;
        if (new Date(comment.createdAt) >= new Date(SINCE_DATE) && comment.body.trim()) {
            csvData.push([pr.url, pr.title, comment.body, comment.createdAt]);
        }
    }
}

// @ts-ignore
function processReviewComments(review, csvData, pr) {
    if (new Date(review.createdAt) >= new Date(SINCE_DATE) && review.body.trim()) {
        csvData.push([pr.url, pr.title, review.body, review.createdAt]);
    }

    // Process comments associated with the review
    for (const commentEdge of review.comments.edges) {
        const comment = commentEdge.node;
        if (new Date(comment.createdAt) >= new Date(SINCE_DATE) && comment.body.trim()) {
            csvData.push([pr.url, pr.title, comment.body, comment.createdAt]);
        }
    }
}

async function main() {
    const pullRequests = await fetchReviewComments();
    const csvData = [['Pull Request Link', 'Pull Request Title', 'Review Comment', 'Comment Date']];

    for (const prEdge of pullRequests) {
        const pr = prEdge.node;

        for (const reviewEdge of pr.reviews.edges) {
            processReviewComments(reviewEdge.node, csvData, pr);  // Process both main review comment and associated comments
        }

        processComments(pr.comments.edges, csvData, pr); // Process general PR comments
    }

    fs.writeFileSync('output.csv', csvData.map(row => row.join(',')).join('\n'));
}

main().catch(error => {
    console.error('Error fetching data:', error);
});
