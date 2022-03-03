const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();
const dbRef = admin.firestore().doc('tokens/verification');
const callbackURL = 'http://127.0.0.1:5000/twitterbot-cfa04/us-central1/callback';
const TwitterApi = require('twitter-api-v2').default;
const twitterClient = new TwitterApi({
  clientId: 'MzlaX2NuaExCZm5GUVh2dWJDZFE6MTpjaQ',
  clientSecret: 'HSlHXEJAjNP88gUNruEP1JsIVZlEZkmRR6oSxHPWI2uzizNntX',
});

const { Configuration, OpenAIApi } = require('openai');
const aiConfig = new Configuration({
  organization: 'org-n4rw3ah0RAuhsJFtbt1w1JJw',
  apiKey: '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',
});
const OpenAI = new OpenAIApi(aiConfig);

exports.auth = functions.https.onRequest(async (req, res) => {
  const { url, codeVerifier, state } = twitterClient.generateOAuth2AuthLink(callbackURL, { scope: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'] });

  await dbRef.set({ codeVerifier, state });

  res.redirect(url);
});

exports.callback = functions.https.onRequest(async (req, res) => {
  const { state, code } = req.query;

  const {codeVerifier, state: storedState} = await (dbRef.get()).data()

  if (state !== storedState) {
    return res.status(400).send('Stored tokens do not match.');
  }

  const { client: loggedClient, accessToken, refreshToken } = await twitterClient.loginWithOAuth2({ code, codeVerifier, redirectUri: callbackURL });

  await dbRef.set({ accessToken, refreshToken });

  res.send('Callback finished')
});

exports.tweet = functions.https.onRequest(async (req, res) => {
  const { refreshToken } = (await dbRef.get()).data();

  const {client: refreshedClient, accessToken, refreshToken: newRefreshToken} = await twitterClient.refreshOAuth2Token(refreshToken);

  await dbRef.set({ accessToken, refreshToken: newRefreshToken });

  const newTweet = await OpenAI.createCompletion('text-davinci-001', {
    prompt: 'Sipping on dirty sprite',
    max_tokens: 64,
  });

  const { data } = await refreshedClient.v2.tweet(
    newTweet.data.choices[0].text
  );

  res.send(data);
});