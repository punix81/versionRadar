import { TestBed } from '@angular/core/testing';
import { VersionMonitoring } from './version-monitoring';

function setup() {
  TestBed.configureTestingModule({});
  return TestBed.inject(VersionMonitoring);
}

describe('VersionMonitoring', () => {

  describe('injection', () => {
    it('should be created', () => {
      const service = setup();
      expect(service).toBeTruthy();
    });

    it('should be injectable as providedIn root', () => {
      const service = setup();
      expect(service).toBeInstanceOf(VersionMonitoring);
    });
  });
});

