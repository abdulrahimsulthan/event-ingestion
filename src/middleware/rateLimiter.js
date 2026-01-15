const MAX_INFLIGHT = 100; // hard limit

let inflight = 0;

const trackInflight = (req, res, next) => {
  if (inflight > MAX_INFLIGHT) {
    console.log('overloaded')
    return res.status(429).send("overloaded");
  }
  else {
    inflight ++
    next()
  }
}
const deductInflight = () => {
  if (inflight > 0) inflight--;
};

module.exports = {
  trackInflight,
  deductInflight,
}
