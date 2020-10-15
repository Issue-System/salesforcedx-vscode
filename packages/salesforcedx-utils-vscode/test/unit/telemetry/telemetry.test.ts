/*
 * Copyright (c) 2018, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { expect } from 'chai';
import * as proxyquire from 'proxyquire';
import { assert, match, SinonStub, stub } from 'sinon';
import { MockContext } from './MockContext';

const mShowInformation = stub();
mShowInformation.returns(Promise.resolve());
const vscodeStub = {
  commands: stub(),
  Uri: {
    parse: stub()
  },
  window: {
    showInformationMessage: mShowInformation
  },
  workspace: {
    getConfiguration: () => {
      return {
        get: () => true
      };
    }
  }
};

const reporter = stub();
const exceptionEvent = stub();
const telemetryReporterStub = class MockReporter {
  public sendTelemetryEvent = reporter;
  public sendExceptionEvent = exceptionEvent;
  public dispose = stub();
};

const cliConfigurationStub = {
  disableCLITelemetry: stub(),
  isCLITelemetryAllowed: () => {
    return Promise.resolve(true);
  }
};

// tslint:disable-next-line
const { TelemetryService } = proxyquire.noCallThru()(
  '../../../src/telemetry/telemetry',
  {
    vscode: vscodeStub,
    './telemetryReporter': { default: telemetryReporterStub },
    '../cli/cliConfiguration': cliConfigurationStub
  }
);

describe('Telemetry', () => {
  const machineId = '45678903';
  const telemetryService = TelemetryService.getInstance();
  let mockContext: MockContext;
  let teleStub: SinonStub;
  let cliStub: SinonStub;

  describe('in dev mode', () => {
    beforeEach(() => {
      teleStub = stub(telemetryService, 'setCliTelemetryEnabled');
      cliStub = stub(telemetryService, 'checkCliTelemetry');
      cliStub.returns(true);
    });

    afterEach(() => {
      teleStub.restore();
      cliStub.restore();
    });

    it('Should not initialize telemetry reporter', async () => {
      // create vscode extensionContext
      mockContext = new MockContext(true);

      await telemetryService.initializeService(
        mockContext,
        'someValue.machineId'
      );

      const telemetryReporter = telemetryService.getReporter();
      expect(typeof telemetryReporter).to.be.eql('undefined');
      expect(teleStub.firstCall.args).to.eql([true]);
    });

    it('Should disable CLI telemetry', async () => {
      mockContext = new MockContext(true);

      cliStub.returns(false);
      await telemetryService.initializeService(
        mockContext,
        'someValue.machineId'
      );

      expect(teleStub.firstCall.args).to.eql([false]);
    });
  });

  describe('production mode', () => {
    beforeEach(() => {
      teleStub = stub(telemetryService, 'setCliTelemetryEnabled');
      cliStub = stub(telemetryService, 'checkCliTelemetry');
      cliStub.returns(true);
    });

    afterEach(() => {
      // exceptionEvent.restore();
      teleStub.restore();
      cliStub.restore();
    });

    it('Should send telemetry data', async () => {
      // create vscode extensionContext in which telemetry msg has been previously shown
      mockContext = new MockContext(true);

      await telemetryService.initializeService(mockContext, machineId);

      telemetryService.sendExtensionActivationEvent([0, 678]);
      assert.calledOnce(reporter);
      expect(teleStub.firstCall.args).to.eql([true]);
    });

    it('Should not send telemetry data', async () => {
      // create vscode extensionContext
      mockContext = new MockContext(true);
      // user has updated settings for not sending telemetry data.
      // settings.restore();
      // settings = stub(
      //   SfdxCoreSettings.prototype,
      //   'getTelemetryEnabled'
      // ).returns(false);

      await telemetryService.initializeService(mockContext, machineId);

      const telemetryEnabled = telemetryService.isTelemetryEnabled();
      expect(telemetryEnabled).to.be.eql(false);

      telemetryService.sendCommandEvent('create_apex_class_command', [0, 678]);
      assert.notCalled(reporter);
      expect(teleStub.firstCall.args).to.eql([false]);
    });

    it('Should send correct data format on sendExtensionActivationEvent', async () => {
      // create vscode extensionContext
      mockContext = new MockContext(true);

      await telemetryService.initializeService(mockContext, machineId);

      telemetryService.sendExtensionActivationEvent([0, 678]);
      assert.calledOnce(reporter);

      const expectedProps = {
        extensionName: 'salesforcedx-vscode-core'
      };
      const expectedMeasures = match({ startupTime: match.number });
      assert.calledWith(
        reporter,
        'activationEvent',
        expectedProps,
        expectedMeasures
      );
      expect(teleStub.firstCall.args).to.eql([true]);
    });

    it('Should send correct data format on sendExtensionDeactivationEvent', async () => {
      // create vscode extensionContext
      mockContext = new MockContext(true);

      await telemetryService.initializeService(mockContext, machineId);

      telemetryService.sendExtensionDeactivationEvent();
      assert.calledOnce(reporter);

      const expectedData = {
        extensionName: 'salesforcedx-vscode-core'
      };
      assert.calledWith(reporter, 'deactivationEvent', expectedData);
      expect(teleStub.firstCall.args).to.eql([true]);
    });

    it('Should send correct data format on sendCommandEvent', async () => {
      // create vscode extensionContext
      mockContext = new MockContext(true);

      await telemetryService.initializeService(mockContext, machineId);

      telemetryService.sendCommandEvent('create_apex_class_command', [0, 678]);
      assert.calledOnce(reporter);

      const expectedProps = {
        extensionName: 'salesforcedx-vscode-core',
        commandName: 'create_apex_class_command'
      };
      const expectedMeasures = { executionTime: match.number };
      assert.calledWith(
        reporter,
        'commandExecution',
        expectedProps,
        match(expectedMeasures)
      );
      expect(teleStub.firstCall.args).to.eql([true]);
    });

    it('Should send correct data format on sendCommandEvent with additional props', async () => {
      // create vscode extensionContext
      mockContext = new MockContext(true);

      await telemetryService.initializeService(mockContext, machineId);
      const additionalProps = {
        dirType: 'testDirectoryType',
        secondParam: 'value'
      };

      telemetryService.sendCommandEvent(
        'create_apex_class_command',
        [0, 678],
        additionalProps
      );
      assert.calledOnce(reporter);

      const expectedProps = {
        extensionName: 'salesforcedx-vscode-core',
        commandName: 'create_apex_class_command',
        dirType: 'testDirectoryType',
        secondParam: 'value'
      };
      const expectedMeasures = { executionTime: match.number };
      assert.calledWith(
        reporter,
        'commandExecution',
        expectedProps,
        match(expectedMeasures)
      );
      expect(teleStub.firstCall.args).to.eql([true]);
    });

    it('Should send correct data format on sendCommandEvent with additional measurements', async () => {
      // create vscode extensionContext
      mockContext = new MockContext(true);

      await telemetryService.initializeService(mockContext, machineId);
      const additionalMeasures = {
        value: 3,
        count: 10
      };

      telemetryService.sendCommandEvent(
        'create_apex_class_command',
        [0, 678],
        undefined,
        additionalMeasures
      );
      assert.calledOnce(reporter);

      const expectedProps = {
        extensionName: 'salesforcedx-vscode-core',
        commandName: 'create_apex_class_command'
      };
      const expectedMeasures = {
        executionTime: match.number,
        value: 3,
        count: 10
      };
      assert.calledWith(
        reporter,
        'commandExecution',
        expectedProps,
        match(expectedMeasures)
      );
      expect(teleStub.firstCall.args).to.eql([true]);
    });

    it('should send correct data format on sendEventData', async () => {
      mockContext = new MockContext(true);

      await telemetryService.initializeService(mockContext, machineId);

      const eventName = 'eventName';
      const property = { property: 'property for event' };
      const measure = { measure: 123456 };
      telemetryService.sendEventData(eventName, property, measure);

      assert.calledWith(reporter, eventName, property, measure);
      expect(teleStub.firstCall.args).to.eql([true]);
    });

    it('Should send data sendExceptionEvent', async () => {
      // create vscode extensionContext
      mockContext = new MockContext(true);

      await telemetryService.initializeService(mockContext, machineId);

      telemetryService.sendException(
        'error_name',
        'this is a test error message'
      );
      assert.calledOnce(exceptionEvent);

      assert.calledWith(
        exceptionEvent,
        'error_name',
        'this is a test error message'
      );
    });

    it('Should not send telemetry data when CLI telemetry is disabled', async () => {
      // create vscode extensionContext
      mockContext = new MockContext(true);

      cliStub.returns(false);
      await telemetryService.initializeService(mockContext, machineId);

      const telemetryEnabled = telemetryService.isTelemetryEnabled();
      expect(telemetryEnabled).to.be.eql(false);

      telemetryService.sendCommandEvent('create_apex_class_command', [0, 123]);
      assert.notCalled(reporter);
      expect(teleStub.firstCall.args).to.eql([false]);
    });
  });

  // describe('TelemetryBuilder', () => {
  //   it('should build object with a property set', () => {
  //     const builder = new TelemetryBuilder();

  //     builder.addProperty('test', 'a');

  //     expect(builder.build()).to.deep.equal(
  //       Object({
  //         properties: { test: 'a' },
  //         measurements: undefined
  //       })
  //     );
  //   });

  //   it('should build object with a measurement set', () => {
  //     const builder = new TelemetryBuilder();

  //     builder.addMeasurement('test', 10);

  //     expect(builder.build()).to.deep.equal(
  //       Object({
  //         properties: undefined,
  //         measurements: { test: 10 }
  //       })
  //     );
  //   });

  //   it('should build object with multiple set', () => {
  //     const builder = new TelemetryBuilder();

  //     builder.addProperty('prop1', 'a');
  //     builder.addProperty('prop2', 'b');
  //     builder.addMeasurement('measure1', 1);
  //     builder.addMeasurement('measure2', 2);

  //     expect(builder.build()).to.deep.equal(
  //       Object({
  //         properties: { prop1: 'a', prop2: 'b' },
  //         measurements: { measure1: 1, measure2: 2 }
  //       })
  //     );
  //   });
  // });
});
