import Model, { attr, belongsTo } from '@ember-data/model';
import { fragmentArray } from 'ember-data-model-fragments/attributes';
import { computed, get, set } from '@ember/object';
import { or, filter, alias } from '@ember/object/computed';
import { tracked } from '@glimmer/tracking';

export const PRIMARY_KEY = 'uid';
export const SLUG_KEY = 'Node.Node,Service.ID';

export const Collection = class Collection {
  @tracked items;

  constructor(items) {
    this.items = items;
  }

  get ExternalSources() {
    const sources = this.items.reduce(function(prev, item) {
      return prev.concat(item.ExternalSources || []);
    }, []);
    // unique, non-empty values, alpha sort
    return [...new Set(sources)].filter(Boolean).sort();
  }
};

export default class ServiceInstance extends Model {
  @attr('string') uid;

  @attr('string') Datacenter;
  // ProxyInstance is the ember-data model relationship
  @belongsTo('Proxy') ProxyInstance;
  // Proxy is the actual JSON api response
  @attr() Proxy;
  @attr() Node;
  @attr() Service;
  @fragmentArray('health-check') Checks;
  @attr('number') SyncTime;
  @attr() meta;

  // The name is the Name of the Service (the grouping of instances)
  @alias('Service.Service') Name;

  // If the ID is blank fallback to the Service.Service (the Name)
  @or('Service.ID', 'Service.Service') ID;
  @or('Service.Address', 'Node.Service') Address;

  @alias('Service.Tags') Tags;
  @alias('Service.Meta') Meta;
  @alias('Service.Namespace') Namespace;

  @filter('Checks.@each.Kind', (item, i, arr) => item.Kind === 'service') ServiceChecks;
  @filter('Checks.@each.Kind', (item, i, arr) => item.Kind === 'node') NodeChecks;

  // MeshChecks are a concatenation of Checks for the Instance and Checks for
  // the ProxyInstance. Checks is an ember-data-model-fragment, so we can't just
  // concat it, we have to loop through all the items in order to merge
  @computed('Checks', 'ProxyInstance.Checks', 'ProxyInstance.ServiceProxy.Expose.Checks')
  get MeshChecks() {
    return (get(this, 'Checks') || [])
      .map(item => {
        set(
          item,
          'Exposed',
          get(this, 'ProxyInstance.ServiceProxy.Expose.Checks') && get(item, 'Exposable')
        );
        return item;
      })
      .concat(
        (get(this, 'ProxyInstance.Checks') || []).map(item => {
          set(
            item,
            'Exposed',
            get(this, 'ProxyInstance.ServiceProxy.Expose.Checks') && get(item, 'Exposable')
          );
          return item;
        })
      );
  }

  @computed('Service.Meta')
  get ExternalSources() {
    const sources = Object.entries(this.Service.Meta || {})
      .filter(([key, value]) => key === 'external-source')
      .map(([key, value]) => {
        return value;
      });
    return [...new Set(sources)];
  }

  @computed('Service.Kind')
  get IsProxy() {
    return ['connect-proxy', 'mesh-gateway', 'ingress-gateway', 'terminating-gateway'].includes(
      this.Service.Kind
    );
  }

  // IsOrigin means that the service can have associated up or down streams,
  // this service being the origin point of those streams
  @computed('Service.Kind')
  get IsOrigin() {
    return !['connect-proxy', 'mesh-gateway'].includes(this.Service.Kind);
  }

  // IsMeshOrigin means that the service can have associated up or downstreams
  // that are in the Consul mesh itself
  @computed('IsOrigin')
  get IsMeshOrigin() {
    return this.IsOrigin && !['terminating-gateway'].includes(this.Service.Kind);
  }

  @computed('ChecksPassing', 'ChecksWarning', 'ChecksCritical')
  get Status() {
    switch (true) {
      case this.ChecksCritical.length !== 0:
        return 'critical';
      case this.ChecksWarning.length !== 0:
        return 'warning';
      case this.ChecksPassing.length !== 0:
        return 'passing';
      default:
        return 'empty';
    }
  }

  @computed('Checks.[]')
  get ChecksPassing() {
    return this.Checks.filter(item => item.Status === 'passing');
  }

  @computed('Checks.[]')
  get ChecksWarning() {
    return this.Checks.filter(item => item.Status === 'warning');
  }

  @computed('Checks.[]')
  get ChecksCritical() {
    return this.Checks.filter(item => item.Status === 'critical');
  }

  @computed('Checks.[]', 'ChecksPassing')
  get PercentageChecksPassing() {
    return (this.ChecksPassing.length / this.Checks.length) * 100;
  }

  @computed('Checks.[]', 'ChecksWarning')
  get PercentageChecksWarning() {
    return (this.ChecksWarning.length / this.Checks.length) * 100;
  }

  @computed('Checks.[]', 'ChecksCritical')
  get PercentageChecksCritical() {
    return (this.ChecksCritical.length / this.Checks.length) * 100;
  }
}
