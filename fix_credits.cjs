const fs = require('fs');
const filePath = 'server/server.js';
let content = fs.readFileSync(filePath, 'utf8');

// Fix 1: Webhook (Stripe) - add paid_credits update
const oldWebhookSelect = ".select('credits')\n      .eq('email', userEmail)\n      .single();";
const newWebhookSelect = ".select('credits, paid_credits')\n      .eq('email', userEmail)\n      .single();";
content = content.replace(oldWebhookSelect, newWebhookSelect);

const oldWebhookUpdate = "update({ credits: user.credits + creditsToAdd })";
const newWebhookUpdate = "update({ \n          credits: (user.credits || 0) + creditsToAdd,\n          paid_credits: (user.paid_credits || 0) + creditsToAdd\n        })";
content = content.replace(oldWebhookUpdate, newWebhookUpdate);

// Fix 2: Calculation logic in /check and /generate/refine
// First, simplify the check by using a variable for start free credits
const unifiedLogic = "(5 - (user.free_generations_used || 0)) + (user.paid_credits || 0)";

// Replace the totalCredits lines everywhere
// Match: (user.total_available_generations !== undefined && user.total_available_generations !== null) ? user.total_available_generations : (user.credits !== undefined ? user.credits : (5 - user.free_generations_used + user.paid_credits))
// Since we have multiple variations, let's use a simpler pattern
const calcPatterns = [
  /const totalCredits = \(user\.total_available_generations !== undefined && user\.total_available_generations !== null\)\s+\? user\.total_available_generations\s+: \(user\.credits !== undefined \? user\.credits : \(5 - user\.free_generations_used \+ user\.paid_credits\)\);/g,
  /const totalCredits = \(user && user\.total_available_generations !== undefined && user\.total_available_generations !== null\)\s+\? user\.total_available_generations\s+: \(user \? \(user\.credits \|\| \(5 - \(user\.free_generations_used \|\| 0\) \+ \(user\.paid_credits \|\| 0\)\)\) : 0\);/g
];

calcPatterns.forEach(pattern => {
  content = content.replace(pattern, `const totalCredits = ${unifiedLogic};`);
});

// Remove total_available_generations from selects to avoid issues
content = content.replace(/select\('credits, free_generations_used, paid_credits, total_available_generations'\)/g, "select('credits, free_generations_used, paid_credits')");

fs.writeFileSync(filePath, content, 'utf8');
console.log('Server file updated!');
