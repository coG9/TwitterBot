const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();
const dbRef = admin.firestore().doc('tokens/demo');
const callbackURL = 'YOUR CALLBACK URL GOES HERE';

const TwitterApi = require('twitter-api-v2').default;
const twitterClient = new TwitterApi({
  clientId: 'YOUR CLIENT ID',
  clientSecret: 'YOUR CLIENT SECRET',
});

const { Configuration, OpenAIApi } = require('openai');
const configuration = new Configuration({
  organization: 'YOUR OPENAI ORGANIZATION ID',
  apiKey: 'YOUR OPEN AI SECRET',
});
const openai = new OpenAIApi(configuration);

exports.auth = functions.https.onRequest(async (req, res) => {
  const { url, codeVerifier, state } = twitterClient.generateOAuth2AuthLink(callbackURL, { scope: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'] });

  await dbRef.set({ codeVerifier, state });

  res.redirect(url);
});

exports.callback = functions.https.onRequest(async (req, res) => {
  const { state, code } = req.query;
  const {codeVerifier, state: storedState} = (await dbRef.get()).data()

  if (state !== storedState) {
    return res.status(400).send('Stored tokens do not match!');
  }

  const {client: loggedClient, accessToken, refreshToken} = await twitterClient.loginWithOAuth2({code, codeVerifier, redirectUri: callbackURL});
  await dbRef.set({ accessToken, refreshToken });

  res.send('Callback complete.')
});

exports.tweet = functions.https.onRequest(async (req, res) => {
  const { refreshToken } = (await dbRef.get()).data();

  const {client: refreshedClient, accessToken, refreshToken: newRefreshToken} = await twitterClient.refreshOAuth2Token(refreshToken);

  await dbRef.set({ accessToken, refreshToken: newRefreshToken });

  const nextTweet = await openai.createCompletion('text-davinci-001', {
    prompt: 'Tweet something interesting about finance or tech.',
    max_tokens: 64,
  });

  const { data } = await refreshedClient.v2.tweet(
    nextTweet.data.choices[0].text
  );

  res.send(data);
});
