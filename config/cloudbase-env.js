'use strict';

// Environment IDs are public routing identifiers, not credentials. Keep the
// business environment and the AI-only environment separate so adding AI does
// not move existing recipe, plan, basket, or image data.
module.exports = {
  businessEnvId: 'lixue-d6gma33ie228d349e',
  aiEnvId: 'lixue-d8gmn8nqr073b77af',
  aiTextFunctionName: 'cookRecipeTextAi'
};
