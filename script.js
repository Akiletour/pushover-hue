const express = require('express');
const huejay = require('huejay');
const WebSocket = require('ws');
const fetch = require('node-fetch');
const config = require('config');

// Check configuration

if (!config.has('pushover.deviceId') || config.pushover.deviceId === "") {
  console.log('Error: pushover.deviceId must be set');
  return false;
}

if (!config.has('pushover.userSecret') || config.pushover.userSecret === "") {
  console.log('Error: pushover.userSecret must be set');
  return false;
}

if (!config.has('hue.host') || config.hue.host === "") {
  console.log('Error: hue.host must be set');
  return false;
}

if (!config.has('hue.username') || config.hue.username === "") {
  console.log('Error: hue.username must be set');
  return false;
}

function delayPromise(duration) {
  return function (...args) {
    return new Promise(function (resolve, reject) {
      setTimeout(function () {
        resolve(...args);
      }, duration)
    });
  };
}

function toXY(red, green, blue) {
  // Gamma correction
  red = (red > 0.04045) ? Math.pow((red + 0.055) / (1.0 + 0.055), 2.4) : (red / 12.92);
  green = (green > 0.04045) ? Math.pow((green + 0.055) / (1.0 + 0.055), 2.4) : (green / 12.92);
  blue = (blue > 0.04045) ? Math.pow((blue + 0.055) / (1.0 + 0.055), 2.4) : (blue / 12.92);

  // Apply wide gamut conversion D65
  const X = red * 0.664511 + green * 0.154324 + blue * 0.162028;
  const Y = red * 0.283881 + green * 0.668433 + blue * 0.047685;
  const Z = red * 0.000088 + green * 0.072310 + blue * 0.986039;

  let fx = X / (X + Y + Z);
  let fy = Y / (X + Y + Z);
  if (isNaN(fx)) {
    fx = 0.0;
  }
  if (isNaN(fy)) {
    fy = 0.0;
  }

  return [parseFloat(fx.toPrecision(4)), parseFloat(fy.toPrecision(4))];
}

const fireAlert = (r, g, b) => {

  client.lights.getById(1)
    .then(light => {
      light.on = true;
      light.xy = toXY(r, g, b);
      light.brightness = 255;

      return client.lights.save(light);
    })
    .then(delayPromise(config.hue.animation.delay * 2))
    .then(light => {
      light.on = false;
      light.xy = toXY(255, 255, 255);
      light.brightness = 30;
      return client.lights.save(light);
    })
    .then(delayPromise(config.hue.animation.delay))
    .then(light => {
      light.on = true;
      light.xy = toXY(r, g, b);
      light.brightness = 255;

      return client.lights.save(light);
    })
    .then(delayPromise(config.hue.animation.delay * 2))
    .then(light => {
      light.on = false;
      light.xy = toXY(255, 255, 255);
      light.brightness = 30;
      return client.lights.save(light);
    })
    .then(delayPromise(config.hue.animation.delay))
    .then(light => {
      light.on = true;
      light.xy = toXY(r, g, b);
      light.brightness = 255;

      return client.lights.save(light);
    })
    .then(delayPromise(config.hue.animation.delay * 2))
    .then(light => {
      light.on = false;
      light.xy = toXY(255, 255, 255);
      light.brightness = 30;
      return client.lights.save(light);
    })
    .catch(error => {
      console.log('Could not find light');
      console.log(error.stack);
    });
};

const client = new huejay.Client({
  host: config.hue.host,
  username: config.hue.username,
});

const app = express();

app.listen(3000, function () {
  const socket = new WebSocket('wss://client.pushover.net/push');

  socket.on('open', () => {
    console.log('Connected');
    try {
      socket.send(`login:${config.pushover.deviceId}:${config.pushover.userSecret}`, (err) => {
        if (err) {
          console.log('Callback returned WS error on send', err);
        }
      })
    } catch (e) {
      console.log('Caught WS error on send', e);
    }
  });

  socket.on('message', (data) => {
    try {
      const command = data.toString('utf8');
      if (command === '!') {
        fetch(`https://api.pushover.net/1/messages.json?secret=${config.pushover.userSecret}&device_id=${config.pushover.deviceId}`)
          .then(res => res.json())
          .then(body => {

            const lastMessage = body.messages[body.messages.length - 1];

            if (lastMessage.message.indexOf(config.pushover.states.success.text) > -1) {
              fireAlert(...config.pushover.states.success.color);
            } else if (lastMessage.message.indexOf(config.pushover.states.warning.text) > -1) {
              fireAlert(...config.pushover.states.warning.color);
            } else if (lastMessage.message.indexOf(config.pushover.states.error.text) > -1) {
              fireAlert(...config.pushover.states.error.color)
            } else {
              fireAlert(...config.pushover.states.default.color);
            }
          });
      }
    }
    catch (err) {
      console.log('err', err)
    }
  });
});
