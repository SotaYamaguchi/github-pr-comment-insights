import fs from 'fs';
import axios from "axios";

const OWNER = 'SotaYamaguchi';
const REPO = 'github-pr-comment-insights';
const TOKEN = '';
const ONE_YEAR_AGO = new Date(Date.now() - 364 * 24 * 60 * 60 * 1000);

const QUERY = `
  query GetRecentPRs($owner: String!, $repo: String!, $after: String) {
    repository(owner: $owner, name: $repo) {
      pullRequests(first: 10, states: [OPEN, CLOSED, MERGED], orderBy: {field: CREATED_AT, direction: DESC}, after: $after) {
        pageInfo {
          endCursor
          hasNextPage
        }
        edges {
          node {
            title
            url
            createdAt
            reviews(first: 100) {
              edges {
                node {
                  body
                  comments(first: 10) {
                    edges {
                      node {
                        body
                        createdAt
                        position
                        path
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

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchReviewComments() {
    let after = null;
    let allPRs = [];

    while (true) {
        console.log('fetching start')
        try {
            const response = await axios.post('https://api.github.com/graphql', {
                query: QUERY,
                variables: {
                    after: after,
                    owner: OWNER,
                    repo: REPO
                }
            }, {
                headers: {
                    'Authorization': `Bearer ${TOKEN}`
                },
                timeout: 10000
            });
            console.log(response.data);
            console.log(response.data.data.repository.pullRequests.pageInfo)

            const prEdges = response.data.data.repository.pullRequests.edges;
            allPRs = allPRs.concat(prEdges);

            const lastPrDate = new Date(prEdges[prEdges.length - 1].node.createdAt);

            if (lastPrDate <= ONE_YEAR_AGO) {
                console.log('lastPrDate <= ONE_YEAR_AGO')
                break;
            }

            if (!response.data.data.repository.pullRequests.pageInfo.hasNextPage) {
                console.log('hasNextPage is false')
                break;
            }

            after = response.data.data.repository.pullRequests.pageInfo.endCursor;
            console.log(after);
            await sleep(2000);

        } catch (error) {
            console.error("Error fetching PRs:", error);
            break;
        }
        console.log('fetching end')
    }

    return allPRs;
}

class ReviewComments {
    private readonly pullRequests: any[];

    constructor(pullRequests: any[]) {
        this.pullRequests = this.excludeDependencyUpdates(pullRequests);
    }

    public getFormattedReviewComments(): any[] {
        const relevantPullRequests = this.filterRelevantPullRequests(this.pullRequests);

        return relevantPullRequests.map(pr => ({
            title: pr.title,
            url: pr.url,
            createdAt: pr.createdAt,
            comments: [...pr.reviews, ...pr.comments]
        }));
    }

    private excludeDependencyUpdates(pullRequests: any[]): any[] {
        return pullRequests.filter(pr => !pr.node.title.includes('chore(deps):'));
    }

    private filterRelevantPullRequests(pullRequests: any[]): any[] {
        return pullRequests
            .map(pr => this.reviewConversations(pr.node))
            .filter(pr => pr.reviews.length || pr.comments.length);
    }

    private reviewConversations(node: any) {
        return {
            title: node.title,
            url: node.url,
            createdAt: node.createdAt,
            reviews: this.getReviews(node.reviews.edges),
            comments: this.getComments(node.comments.edges)
        };
    }

    private getReviews(edges: any[]): any[] {
        const reviewsWithPosition: { [position: number]: string[] } = {};
        const nullReviews: string[][] = [];

        edges.forEach(edge => {
            if (edge.node.comments.edges.length) {
                edge.node.comments.edges.forEach(commentEdge => {
                    const { body, position } = commentEdge.node;

                    if (position === null) {
                        nullReviews.push([body]);
                    } else {
                        if (!reviewsWithPosition[position]) {
                            reviewsWithPosition[position] = [];
                        }
                        reviewsWithPosition[position].push(body);
                    }
                });
            }
        });

        const positionedReviews = [];
        for (const key in reviewsWithPosition) {
            positionedReviews.push(reviewsWithPosition[key]);
        }

        return [...positionedReviews, ...nullReviews];
    }

    private getComments(edges: any[]): any[] {
        return edges.map(edge => [edge.node.body]);
    }
}

async function main() {
    const pullRequests = await fetchReviewComments();
    const reviewComments = new ReviewComments(pullRequests);
    const formattedReviewComments = reviewComments.getFormattedReviewComments();

    console.log(`Found ${formattedReviewComments.length} pull requests`);
    const tmp_jsonString = JSON.stringify(formattedReviewComments, null, 2);
    fs.writeFileSync('tmp_output.json', tmp_jsonString);

    let filteredPullRequests = pullRequests.filter((pr: any) => {
      return !(pr.node.reviews.edges.length === 0 && pr.node.comments.edges.length === 0)
    })

    console.log(`Found ${filteredPullRequests.length} pull requests`);
    const jsonString = JSON.stringify(filteredPullRequests, null, 2);
    fs.writeFileSync('output.json', jsonString);
}

main().catch(error => {
    console.error('Error fetching data:', error);
});
