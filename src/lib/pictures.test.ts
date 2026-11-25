import { acceptPictures, fitWithin, MAX_PICTURES } from './pictures';

const img = (name = 'a.jpg') => ({ type: 'image/jpeg', name });

describe('acceptPictures', () => {
  it('takes pictures up to the limit and explains the rest', () => {
    expect(acceptPictures(0, [img(), img()])).toEqual({ take: [0, 1], note: null });
    expect(acceptPictures(MAX_PICTURES - 1, [img(), img()])).toEqual({ take: [0], note: `At most ${MAX_PICTURES} pictures per message` });
    expect(acceptPictures(0, [{ type: 'application/pdf', name: 'x.pdf' }, img()])).toEqual({ take: [1], note: 'Only pictures can be sent' });
  });
});

describe('fitWithin', () => {
  it('shrinks the longer side to the limit, never enlarges', () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(1080, 1920)).toEqual({ width: 900, height: 1600 });
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });
});
