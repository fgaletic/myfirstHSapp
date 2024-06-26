require('dotenv').config();
const express = require('express');
const querystring = require('querystring');
const axios = require('axios');
const session = require('express-session');

const app = express();

app.set('view engine', 'pug');

const CLIENT_ID = `${process.env.CLIENT_ID}`;
const CLIENT_SECRET = `${process.env.CLIENT_SECRET}`;

const REDIRECT_URI =`https://genetic-rebecca-nuclio-fsd-realista.koyeb.app/oauth-callback`;
// const REDIRECT_URI =`http://localhost:3000/oauth-callback`

const authUrl = 'https://app-eu1.hubspot.com/oauth/authorize?client_id=48145012-6c87-4db6-b577-bb87b5f1547e&redirect_uri=https://genetic-rebecca-nuclio-fsd-realista.koyeb.app/oauth-callback&scope=crm.objects.contacts.read%20crm.objects.contacts.write';
// const authUrl = 'https://app-eu1.hubspot.com/oauth/authorize?client_id=48145012-6c87-4db6-b577-bb87b5f1547e&redirect_uri=http://localhost:3000/oauth-callback&scope=crm.objects.contacts.read%20crm.objects.contacts.write';


const tokenStore = {};

app.use(session({
    secret: Math.random().toString(36).substring(2),
    resave: false,
    saveUninitialized: true
}));

const isAuthorized = (userId) => {
    return tokenStore[userId] ? true : false;
};

// * 1. Send user to authorization page. This kicks off initial request to OAuth server.

app.get('/', async (req, res) => {
    if (isAuthorized(req.sessionID)) {
        const accessToken = tokenStore[req.sessionID];
        const headers = {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        };
        const contacts = `https://api.hubapi.com/crm/v3/objects/contacts`;
        try {
            const resp = await axios.get(contacts, { headers });
            const data = resp.data;

            // Make a request to the 'Get account details' endpoint
            const accountResponse = await axios.get('https://api.hubapi.com/integrations/v1/me', {
                headers: {
                    Authorization: `Bearer ${accessToken}`
                }
            });

            // Store the portal ID in the session
            req.session.portalId = accountResponse.data.portalId;

            res.render('home', {
                token: accessToken,
                contacts: data.results,
                portalId: req.session.portalId // Pass the portal ID to the view
            });
        } catch (error) {
            console.error(error);
        }
    } else {
        res.render('home', { authUrl });
    }
});

// * 2. Get temporary authorization code from OAuth server
// * 3. Combine temporary auth code with app credentials and send back to OAuth server

app.get('/oauth-callback', async (req, res) => {
    // res.send(req.query.code);
    const authCodeProof = {
        grant_type: 'authorization_code',
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        code: req.query.code
    }
    try {
        const tokenResponse = await axios.post('https://api.hubapi.com/oauth/v1/token', querystring.stringify(authCodeProof));

        const accessToken = tokenResponse.data.access_token;
        tokenStore[req.sessionID] = accessToken;
    
        const accountResponse = await axios.get(`https://api.hubapi.com/oauth/v1/access-tokens/${accessToken}`);
    
        req.session.hubId = accountResponse.data.signed_access_token.hubId;
        req.session.appId = accountResponse.data.signed_access_token.appId;
    
        const redirectUri = `https://app.hubspot.com/integrations-settings/${req.session.hubId}/installed/framework/${req.session.appId}/general-settings`;
        res.redirect(redirectUri);
    } catch (error) {
        console.error('Error:', error); // Modified logging
    }
});

// * 4. Get access and refresh tokens.

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

